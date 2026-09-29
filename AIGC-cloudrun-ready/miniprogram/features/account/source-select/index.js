const api = require("../../../services/api");

function text(value, fallback = "") {
  const result = String(value || "").trim();
  return result || fallback;
}

function friendlyError(error, fallback) {
  const messages = { NO_RELIABLE_SOURCE: "暂时没有可靠来源，你可以补充资料，也可以先跳过。", DRAFT_REVISION_CONFLICT: "草稿已更新，请重新选择来源。", SOURCE_PROVIDER_UNAVAILABLE: "公开搜索暂时不可用，已尝试使用精选目录。" };
  return messages[error && error.code] || error && error.message || fallback;
}

Page({
  data: {
    loading: true,
    searching: false,
    error: "",
    draft: null,
    bundles: [],
    selectedBundleId: "",
    userSourceTitle: "",
    userSourceUrl: "",
    searchModeLabel: "",
  },

  onLoad(query) {
    this.mode = query && query.mode === "PARALLEL" ? "PARALLEL" : "INITIAL";
    this.load();
  },

  onShow() {
    if (!this.loaded) return;
    const draft = getApp().globalData.goalDraft;
    if (draft && draft.mode === this.mode && (!this.data.draft || draft.revision !== this.data.draft.revision)) this.renderDraft(draft);
  },

  async load() {
    const app = getApp();
    const base = this.mode === "INITIAL"
      ? app.globalData.registrationPayload
      : app.globalData.goalSetupPayload;
    if (!base) {
      this.setData({ loading: false, error: "目标参数已失效，请返回重新填写。" });
      return;
    }
    this.basePayload = base;
    this.setData({ loading: true, error: "" });
    try {
      let draft = app.globalData.goalDraft;
      const title = base.goal || base.title || base.goalProfile && base.goalProfile.title;
      if (!draft || draft.mode !== this.mode || text(draft.goalProfile && draft.goalProfile.title) !== text(title)) {
        draft = await api.createGoalDraft({
          mode: this.mode,
          goalProfile: this.mode === "INITIAL" ? base : { ...base, title: base.title || base.goal },
        });
      }
      if (draft.status === "CREATED") {
        draft = await api.searchGoalSources(draft.draftId, { expectedRevision: draft.revision });
      }
      app.globalData.goalDraft = draft;
      this.renderDraft(draft);
    } catch (error) {
      this.setData({ error: friendlyError(error, "来源搜索失败") });
    } finally {
      this.loaded = true;
      this.setData({ loading: false });
    }
  },

  renderDraft(draft) {
    const candidates = draft.sourceCandidates || [];
    const byId = new Map(candidates.map((source) => [source.sourceId, source]));
    const bundles = (draft.sourceBundles || []).map((bundle) => ({
      ...bundle,
      selected: bundle.bundleId === draft.selectedBundleId,
      sources: (bundle.sourceIds || []).map((id) => byId.get(id)).filter(Boolean),
    }));
    this.setData({
      draft,
      bundles,
      selectedBundleId: draft.selectedBundleId || "",
      searchModeLabel: draft.searchMode === "NO_RELIABLE_SOURCE" ? "暂未找到合适资料" : draft.searchMode === "CATALOG_ONLY" ? "已使用精选目录" : draft.searchMode === "USER_AND_CATALOG" ? "已合并你的资料与精选目录" : "已完成公开来源搜索",
    });
  },

  input(event) {
    const key = event.currentTarget.dataset.key;
    this.setData({ [key]: event.detail.value, error: "" });
  },

  chooseBundle(event) {
    const selectedBundleId = event.currentTarget.dataset.id;
    this.setData({ selectedBundleId, bundles: this.data.bundles.map((bundle) => ({ ...bundle, selected: bundle.bundleId === selectedBundleId })) });
  },

  copySource(event) {
    const url = text(event.currentTarget.dataset.url);
    if (!url) {
      wx.showToast({ title: "该来源暂未提供链接", icon: "none" });
      return;
    }
    wx.setClipboardData({
      data: url,
      success: () => wx.showToast({ title: "链接已复制", icon: "success" }),
    });
  },

  async searchAgain() {
    if (!this.data.draft || this.data.searching) return;
    const title = this.data.userSourceTitle.trim();
    const url = this.data.userSourceUrl.trim();
    if (url && !title) {
      wx.showToast({ title: "请给已有资料填写名称", icon: "none" });
      return;
    }
    this.setData({ searching: true, error: "" });
    try {
      const userSources = title ? [{ title, url }] : [];
      const draft = await api.searchGoalSources(this.data.draft.draftId, {
        expectedRevision: this.data.draft.revision,
        userSources,
      });
      getApp().globalData.goalDraft = draft;
      this.renderDraft(draft);
      this.setData({ userSourceTitle: "", userSourceUrl: "" });
    } catch (error) {
      this.setData({ error: friendlyError(error, "来源搜索失败") });
    } finally {
      this.setData({ searching: false });
    }
  },

  async continueToPlan() {
    const draft = this.data.draft;
    if (!draft || !this.data.selectedBundleId) {
      wx.showToast({ title: "请先选择一条学习来源路线", icon: "none" });
      return;
    }
    this.setData({ searching: true, error: "" });
    try {
      const next = await api.selectGoalSources(draft.draftId, {
        bundleId: this.data.selectedBundleId,
        expectedRevision: draft.revision,
      });
      getApp().globalData.goalDraft = next;
      wx.navigateTo({ url: "/features/account/plan-review/index?draftId=" + encodeURIComponent(next.draftId) });
    } catch (error) {
      this.setData({ error: friendlyError(error, "来源选择失败") });
    } finally {
      this.setData({ searching: false });
    }
  },

  async skipSources() {
    const draft = this.data.draft;
    if (!draft || this.data.searching) return;
    this.setData({ searching: true, error: "" });
    try {
      const next = await api.selectGoalSources(draft.draftId, {
        skip: true,
        expectedRevision: draft.revision,
      });
      getApp().globalData.goalDraft = next;
      wx.navigateTo({ url: "/features/account/plan-review/index?draftId=" + encodeURIComponent(next.draftId) });
    } catch (error) {
      this.setData({ error: friendlyError(error, "暂时无法跳过资料选择") });
    } finally {
      this.setData({ searching: false });
    }
  },

  back() { wx.navigateBack(); },
});
