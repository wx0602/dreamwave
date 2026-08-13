const {
  getRole,
  getRoleOrThrow,
  getRolesMap,
  listRoles,
  initializeAgentCatalog,
} = require("../services/agentCatalogService");

module.exports = {
  getRole,
  getRoleOrThrow,
  listRoles,
  initializeAgentCatalog,
  get roles() {
    return getRolesMap();
  },
};
