const api = require("../../../services/api");
const storage = require("../../../utils/storage");
const { FALLBACK_ROLES, ROLE_META, mergeRemoteRoles } = require("../../../utils/roles");

Page({
  data: { roles: FALLBACK_ROLES, current: 0, loading: true },
  async onLoad() {
    try {
      const roles = await api.listRoles();
      this.setData({ roles: mergeRemoteRoles(roles) });
    } catch (error) {
      this.setData({ roles: FALLBACK_ROLES });
    } finally { this.setData({ loading: false }); }
  },
  onChange(event) { this.setData({ current: event.detail.current }); },
  choose(event) { this.setData({ current: Number(event.currentTarget.dataset.index) || 0 }); },
  next() {
    const role = this.data.roles[this.data.current] || this.data.roles[0];
    const meta = ROLE_META[role.id] || ROLE_META.traveler;
    storage.set(storage.KEYS.selectedRole, role.id);
    storage.set(storage.KEYS.companion, { name: meta.companionName, tag: meta.companionTag });
    wx.navigateTo({ url: `/features/account/register/index?roleId=${encodeURIComponent(role.id)}` });
  },
});
