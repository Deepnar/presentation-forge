/** Account-scoped provider settings, budgets, usage, and key routes. */

import { bearerToken, getUserId, userForToken } from "../../src/auth.js";
import {
  autoStatus, clearApiKey, clearUserApiKey, cloudKeyName, cloudStatus,
  getUserApiKey, routingPreference, setApiKey, setRoutingPreference,
  setUserApiKey, testAutoConnection, testCloudConnection,
} from "../../src/cloud.js";
import {
  byokCostAcceptedAt, byokUsage, recordByokCostAcceptance, setByokBudget,
} from "../../src/byok-budget.js";
import {
  getUsage, lifetimeTokens, limitConfig, planFor, PLANS,
} from "../../src/limits.js";
import { estimateTokens } from "../../src/usage.js";
import { requireAdminUser, requireAuth, resolveUser } from "./auth-routes.js";
import { fail, ok, wrap } from "./http.js";

const budgetStatus = (userId) => ({
  ...byokUsage(userId),
  typicalDeckEstimate: estimateTokens({ slides: 22, research: true }),
});

export function registerAccountRoutes(app) {
  app.get("/api/cloud", wrap(async (req, res) => {
    const user = await resolveUser(req);
    const userId = user ? getUserId(user.email) : null;
    ok(res, { cloud: await cloudStatus(userId), budget: userId ? budgetStatus(userId) : null });
  }));

  app.put("/api/cloud/budget", wrap(async (req, res) => {
    const user = await requireAuth(req, res, "log in to change the BYOK safety budget");
    if (!user) return;
    const userId = getUserId(user.email);
    if (!userId) return fail(res, 404, "no such user");
    setByokBudget(userId, req.body?.dailyTokens);
    ok(res, { budget: budgetStatus(userId) });
  }));

  app.put("/api/cloud/key", wrap(async (req, res) => {
    if (!(await requireAdminUser(req, res,
      "the shared provider key is an operator setting — add your own key under Settings → Cloud"))) return;
    const { key } = req.body ?? {};
    if (typeof key !== "string" || !/^sk-[A-Za-z0-9_-]{8,}$/.test(key)) {
      return fail(res, 400, "key must look like an API key (starts with sk-, at least 8 chars)");
    }
    const name = await cloudKeyName();
    if (!name) return fail(res, 400, "no cloud provider configured in config/models.yaml");
    await setApiKey(name, key);
    ok(res);
  }));

  app.delete("/api/cloud/key", wrap(async (req, res) => {
    if (!(await requireAdminUser(req, res, "the shared provider key is an operator setting"))) return;
    const name = await cloudKeyName();
    if (name) await clearApiKey(name);
    ok(res);
  }));

  app.post("/api/cloud/test", wrap(async (req, res) => {
    if (!(await requireAuth(req, res, "log in to test a provider"))) return;
    ok(res, await testCloudConnection());
  }));

  app.put("/api/cloud/routing", wrap(async (req, res) => {
    const user = await requireAuth(req, res, "log in to change routing");
    if (!user) return;
    const userId = getUserId(user.email);
    await setRoutingPreference(req.body?.route, userId);
    ok(res, { route: await routingPreference(userId) });
  }));

  app.get("/api/auto/status", wrap(async (req, res) => {
    const user = await resolveUser(req);
    ok(res, { auto: await autoStatus(user ? getUserId(user.email) : null), limits: limitConfig() });
  }));

  app.post("/api/auto/test", wrap(async (req, res) => {
    if (!(await requireAuth(req, res, "log in to test the gateway"))) return;
    ok(res, await testAutoConnection());
  }));

  app.get("/api/auto/usage", wrap(async (req, res) => {
    const user = await userForToken(bearerToken(req.headers.authorization));
    if (!user) return fail(res, 401, "log in to see usage");
    const userId = getUserId(user.email);
    if (!userId) return fail(res, 404, "no such user");
    const plan = planFor(userId);
    const limits = limitConfig(plan);
    const usage = getUsage({ userId });
    const spentEver = lifetimeTokens(userId);
    ok(res, {
      usage, limits, plan, planLabel: PLANS[plan]?.label ?? plan,
      trial: limits.lifetimeTokens === Infinity ? null : {
        spent: spentEver,
        cap: limits.lifetimeTokens,
        remaining: Math.max(0, limits.lifetimeTokens - spentEver),
      },
      remaining: {
        windowRequests: Math.max(0, limits.windowRequests - usage.window.requests),
        weeklyRequests: Math.max(0, limits.weeklyRequests - usage.week.requests),
        windowSlides: Math.max(0, limits.windowSlides - usage.window.slides),
        weeklySlides: Math.max(0, limits.weeklySlides - usage.week.slides),
        weeklyTokens: Math.max(0, limits.weeklyTokens - usage.week.tokens),
        lifetimeTokens: limits.lifetimeTokens === Infinity
          ? null
          : Math.max(0, limits.lifetimeTokens - spentEver),
      },
    });
  }));

  app.get("/api/keys/status", wrap(async (req, res) => {
    const user = await userForToken(bearerToken(req.headers.authorization));
    if (!user) return fail(res, 401, "log in to see keys");
    const userId = getUserId(user.email);
    ok(res, {
      hasKey: userId ? Boolean(await getUserApiKey(userId)) : false,
      costAcceptedAt: userId ? byokCostAcceptedAt(userId) : null,
    });
  }));

  app.put("/api/keys", wrap(async (req, res) => {
    const user = await userForToken(bearerToken(req.headers.authorization));
    if (!user) return fail(res, 401, "log in to save a key");
    const { key, provider, acceptCosts } = req.body ?? {};
    if (typeof key !== "string" || !/^sk-[A-Za-z0-9_-]{8,}$/.test(key)) {
      return fail(res, 400, "key must look like sk-... (at least 8 chars after prefix)");
    }
    const userId = getUserId(user.email);
    if (!userId) return fail(res, 404, "no such user");
    if (acceptCosts !== true) {
      return fail(res, 400,
        "confirm that your model provider bills your account and that its own billing cap remains your responsibility");
    }
    await setUserApiKey(userId, provider ?? "openai", key);
    ok(res, { costAcceptedAt: recordByokCostAcceptance(userId) });
  }));

  app.delete("/api/keys", wrap(async (req, res) => {
    const user = await userForToken(bearerToken(req.headers.authorization));
    if (!user) return fail(res, 401, "log in to clear keys");
    const userId = getUserId(user.email);
    if (userId) await clearUserApiKey(userId);
    ok(res);
  }));
}
