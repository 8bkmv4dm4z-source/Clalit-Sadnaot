import assert from "node:assert/strict";
import test from "node:test";

import {
  getAuthenticatedNavItems,
  getPublicNavItems,
  NAV_LINKS,
} from "../../src/components/nav/navigationConfig.js";

test("public nav reuses shared workshops/login/register links", () => {
  const publicItems = getPublicNavItems();

  assert.deepEqual(
    publicItems.map((item) => item.key),
    [NAV_LINKS.workshops.key, NAV_LINKS.login.key, NAV_LINKS.register.key]
  );
  assert.equal(publicItems[0].path, "/workshops");
});

test("authenticated nav excludes admin links while capability check is pending", () => {
  const items = getAuthenticatedNavItems({ canAccessAdmin: true, isChecking: true });

  assert.equal(items.some((item) => item.key === NAV_LINKS.adminHub.key), false);
  assert.equal(items.some((item) => item.key === NAV_LINKS.users.key), false);
});

test("authenticated nav includes admin links when access is allowed", () => {
  const items = getAuthenticatedNavItems({ canAccessAdmin: true, isChecking: false });

  assert.equal(items.some((item) => item.key === NAV_LINKS.newWorkshop.key), true);
  assert.equal(items.some((item) => item.key === NAV_LINKS.adminHub.key), true);
  assert.equal(items.some((item) => item.key === NAV_LINKS.users.key), true);
});
