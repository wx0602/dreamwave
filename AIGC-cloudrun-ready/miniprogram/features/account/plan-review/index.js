const api = require("../../../services/api");
const { showError } = require("../../../utils/ui");

function text(value, fallback = "") {
  const result = String(value || "").trim();
  return result || fallback;
}

function makeConfirmationKey() {
  return "confirm-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
}

Page({
  data: {
    loading: true,
    generating: false,
    confirming: false,
    error: "",
    draft: null,
    sources: [],
    firstWeek: [],
    milestones: [],
    adjustment: "",
  },

  onLoad(query) {
    this.draftId = query && query.draftId;
    if (!this.draftId) {
      this.setData({ loading: false, error: "计划草稿不存在，请返回重新选择来源。" });
      return;
    }
    this.load();
  },

  async load() {
    this.setData({ loading: true, error: "" });
    try {
      let draft = getApp().globalData.goalDraft;
      if (!draft || draft.draftId !== this.draftId) draft = await api.getGoalDraft(this.draftId);
      getApp().globalData.goalDraft = draft;
      this.renderDraft(draft);
      if (draft.status === "SOURCE_SELECTED") await this.generate();
      else if (draft.status !== "PLAN_READY") this.setData({ error: "请先完成来源选择。" });
    } catch (error) {
      this.setData({ error: error.message || "计划加载失败" });
    } finally {
      this.setData({ loading: false });
    }
  },

  renderDraft(draft) {
    const selectedIds = draft.selectedSourceIds || [];
    const sources = (draft.sourceCandidates || []).filter((source) => selectedIds.includes(source.sourceId));
    const plan = draft.planDraft || {};
    const firstWeek = (plan.firstWeek || []).map((day) => ({
      ...day,
      optionalTasks: (day.optionalTasks || []).slice(0, 2),
      coreTask: day.coreTask ? {
        ...day.coreTask,
        sourceTitle: day.coreTask.sourceRef && day.coreTask.sourceRef.sourceTitle || "已选来源",
      } : null,
    }));
    this.setData({
      draft,
      sources,
      firstWeek,
      milestones: plan.weeklyMilestones || [],
    });
  },

  input(event) { this.setData({ adjustment: event.detail.value }); },

  async generate() {
    const draft = this.data.draft;
    if (!draft || this.data.generating) return;
    this.setData({ generating: true, error: "" });
    try {
      const next = await api.generateGoalPlan(draft.draftId, {
        expectedRevision: draft.revision,
        adjustment: this.data.adjustment.trim(),
      });
      getApp().globalData.goalDraft = next;
      this.renderDraft(next);
      this.setData({ adjustment: "" });
    } catch (error) {
      this.setData({ error: error.message || "计划生成失败" });
    } finally {
      this.setData({ generating: false });
    }
  },

  backToSources() { wx.navigateBack(); },

  async confirmPlan() {
    const draft = this.data.draft;
    if (!draft || draft.status !== "PLAN_READY" || !draft.planDraft || this.data.confirming) {
      wx.showToast({ title: "计划还没有准备好", icon: "none" });
      return;
    }
    const app = getApp();
    const confirmationKey = makeConfirmationKey();
    if (draft.mode === "PARALLEL") {
      this.setData({ confirming: true, error: "" });
      try {
        const result = await api.confirmGoalDraft(draft.draftId, {
          draftId: draft.draftId,
          expectedRevision: draft.revision,
          confirmationKey,
          mode: "PARALLEL",
        });
        app.globalData.state = result.state;
        app.globalData.goalDraft = null;
        app.globalData.goalSetupPayload = null;
        app.globalData.confirmationPayload = null;
        wx.redirectTo({ url: "/features/adventure/goal-map/index" });
      } catch (error) {
        this.setData({ error: error.message || "确认失败" });
      } finally {
        this.setData({ confirming: false });
      }
      return;
    }
    const registration = app.globalData.registrationPayload || {};
    app.globalData.confirmationPayload = {
      draftId: draft.draftId,
      expectedRevision: draft.revision,
      confirmationKey,
      mode: draft.mode,
      registration: { account: registration.account || "", password: registration.password || "" },
    };
    wx.navigateTo({ url: "/features/account/entering/index" });
  },
});
