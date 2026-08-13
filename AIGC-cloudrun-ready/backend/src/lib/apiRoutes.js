const API_PREFIX = "/api";

const API_ROUTES = Object.freeze({
  roles: `${API_PREFIX}/roles`,
  sessions: `${API_PREFIX}/sessions`,
  sessionLogins: `${API_PREFIX}/session-logins`,
  currentSession: `${API_PREFIX}/sessions/current`,
  tasks: `${API_PREFIX}/tasks`,
  goalsAdvance: `${API_PREFIX}/goals/advance`,
  goalsReplan: `${API_PREFIX}/goals/replan`,
  goalsNextSuggestion: `${API_PREFIX}/goals/next-suggestion`,
  goalsAdoptSuggestion: `${API_PREFIX}/goals/adopt-suggestion`,
  currentDungeonStatus: `${API_PREFIX}/dungeons/current/status`,
  currentDungeonStart: `${API_PREFIX}/dungeons/current/start`,
  currentDungeonEvent: `${API_PREFIX}/dungeons/current/events`,
  currentDungeonSettlement: `${API_PREFIX}/dungeons/current/settlement`,
  currentAgent: `${API_PREFIX}/agents/current`,
  currentAgentMemories: `${API_PREFIX}/agents/current/memories`,
  purchases: `${API_PREFIX}/purchases`,
});

const TASK_COMPLETION_PATTERN = /^\/api\/tasks\/([^/]+)\/completion$/;
const TASK_EDIT_PATTERN = /^\/api\/tasks\/([^/]+)\/edits$/;

function matchTaskCompletionPath(pathname) {
  return pathname.match(TASK_COMPLETION_PATTERN);
}

function matchTaskEditPath(pathname) {
  return pathname.match(TASK_EDIT_PATTERN);
}

function buildTaskCompletionPath(taskId) {
  return `${API_ROUTES.tasks}/${encodeURIComponent(taskId)}/completion`;
}

function buildTaskEditPath(taskId) {
  return `${API_ROUTES.tasks}/${encodeURIComponent(taskId)}/edits`;
}

module.exports = {
  API_PREFIX,
  API_ROUTES,
  TASK_COMPLETION_PATTERN,
  TASK_EDIT_PATTERN,
  matchTaskCompletionPath,
  matchTaskEditPath,
  buildTaskCompletionPath,
  buildTaskEditPath,
};
