const API_PREFIX = "/api";

const API_ROUTES = Object.freeze({
  roles: `${API_PREFIX}/roles`,
  sessions: `${API_PREFIX}/sessions`,
  sessionLogins: `${API_PREFIX}/session-logins`,
  currentSession: `${API_PREFIX}/sessions/current`,
  tasks: `${API_PREFIX}/tasks`,
  goals: `${API_PREFIX}/goals`,
  goalsAdvance: `${API_PREFIX}/goals/advance`,
  goalsReplan: `${API_PREFIX}/goals/replan`,
  goalsNextSuggestion: `${API_PREFIX}/goals/next-suggestion`,
  goalsAdoptSuggestion: `${API_PREFIX}/goals/adopt-suggestion`,
  currentDungeonStatus: `${API_PREFIX}/dungeons/current/status`,
  currentDungeonStart: `${API_PREFIX}/dungeons/current/start`,
  currentDungeonEvent: `${API_PREFIX}/dungeons/current/events`,
  currentDungeonSettlement: `${API_PREFIX}/dungeons/current/settlement`,
  starMapToolUses: `${API_PREFIX}/star-map/tools/uses`,
  currentAgent: `${API_PREFIX}/agents/current`,
  currentAgentMemories: `${API_PREFIX}/agents/current/memories`,
  purchases: `${API_PREFIX}/purchases`,
  goalDrafts: `${API_PREFIX}/goal-drafts`,
  goalsPriority: `${API_PREFIX}/goals`,
});

const TASK_COMPLETION_PATTERN = /^\/api\/tasks\/([^/]+)\/completion$/;
const TASK_EDIT_PATTERN = /^\/api\/tasks\/([^/]+)\/edits$/;
const GOAL_DRAFT_PATTERN = /^\/api\/goal-drafts\/([^/]+)$/;
const GOAL_DRAFT_ACTION_PATTERN = /^\/api\/goal-drafts\/([^/]+)\/(source-searches|source-selections|plan-generations|confirmations)$/;
const GOAL_PRIORITY_PATTERN = /^\/api\/goals\/([^/]+)\/priority$/;

function matchTaskCompletionPath(pathname) {
  return pathname.match(TASK_COMPLETION_PATTERN);
}

function matchTaskEditPath(pathname) {
  return pathname.match(TASK_EDIT_PATTERN);
}

function matchGoalDraftPath(pathname) {
  return pathname.match(GOAL_DRAFT_PATTERN);
}

function matchGoalDraftActionPath(pathname) {
  return pathname.match(GOAL_DRAFT_ACTION_PATTERN);
}

function matchGoalPriorityPath(pathname) {
  return pathname.match(GOAL_PRIORITY_PATTERN);
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
  GOAL_DRAFT_PATTERN,
  GOAL_DRAFT_ACTION_PATTERN,
  GOAL_PRIORITY_PATTERN,
  matchTaskCompletionPath,
  matchTaskEditPath,
  matchGoalDraftPath,
  matchGoalDraftActionPath,
  matchGoalPriorityPath,
  buildTaskCompletionPath,
  buildTaskEditPath,
};
