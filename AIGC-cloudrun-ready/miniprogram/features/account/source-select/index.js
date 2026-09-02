const api = require("../../../services/api");

function text(value, fallback = "") {
  const result = String(value || "").trim();
  return result || fallback;
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
      this.setData({ error: error.message || "来源搜索失败" });
    } finally {
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
      searchModeLabel: draft.searchMode === "CATALOG_ONLY" ? "已使用精选目录" : draft.searchMode === "USER_AND_CATALOG" ? "已合并你的资料与精选目录" : "已完成公开来源搜索",
    });
  },

  input(event) {
    const key = event.currentTarget.dataset.key;
    this.setData({ [key]: event.detail.value, error: "" });
  },

  chooseBundle(event) {
    this.setData({ selectedBundleId: event.currentTarget.dataset.id });
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
      this.setData({ error: error.message || "来源搜索失败" });
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
      this.setData({ error: error.message || "来源选择失败" });
    } finally {
      this.setData({ searching: false });
    }
  },

  back() { wx.navigateBack(); },
});
