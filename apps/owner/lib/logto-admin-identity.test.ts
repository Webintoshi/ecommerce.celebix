import assert from "node:assert/strict";
import test from "node:test";

import { findOrCreateLogtoAdminIdentity } from "./logto-admin-identity.ts";
import type { LogtoManagementTransport } from "./logto-management-transport.ts";

type LogtoUser = {
  id: string;
  primaryEmail: string;
  name?: string | null;
};

class InMemoryUserTransport implements LogtoManagementTransport {
  users: LogtoUser[];
  requestedPaths: string[] = [];
  createdBodies: Array<Record<string, unknown>> = [];

  constructor(users: LogtoUser[] = []) {
    this.users = structuredClone(users);
  }

  async request<T>(pathname: string, init: RequestInit = {}): Promise<T> {
    this.requestedPaths.push(pathname);
    const method = init.method ?? "GET";

    if (method === "GET") {
      const url = new URL(pathname, "https://auth.celebix.co");
      assert.equal(url.pathname, "/api/users");
      return structuredClone(this.users) as T;
    }

    assert.equal(method, "POST");
    assert.equal(pathname, "/api/users");
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    this.createdBodies.push(body);
    const created = {
      id: `user-${this.users.length + 1}`,
      primaryEmail: String(body.primaryEmail),
      name: typeof body.name === "string" ? body.name : null,
    };
    this.users.push(created);
    return structuredClone(created) as T;
  }
}

test("exact normalized email search reuses the existing central identity", async () => {
  const transport = new InMemoryUserTransport([
    { id: "wrong-user", primaryEmail: "manager+old@example.com", name: "Wrong" },
    { id: "central-user", primaryEmail: "manager@example.com", name: "Existing Manager" },
  ]);

  const identity = await findOrCreateLogtoAdminIdentity(
    {
      email: "  Manager@Example.com ",
      fullName: "Replacement Name",
      password: "a-different-password",
    },
    transport,
  );

  const lookup = new URL(transport.requestedPaths[0], "https://auth.celebix.co");
  assert.equal(lookup.searchParams.get("search.primaryEmail"), "manager@example.com");
  assert.equal(lookup.searchParams.get("mode.primaryEmail"), "exact");
  assert.equal(lookup.searchParams.get("page"), "1");
  assert.equal(lookup.searchParams.get("page_size"), "2");
  assert.deepEqual(identity, {
    subject: "central-user",
    email: "manager@example.com",
    fullName: "Existing Manager",
    created: false,
  });
  assert.equal(transport.createdBodies.length, 0);
  assert.equal(transport.users[1].name, "Existing Manager");
});

test("local exact filtering rejects an API result that only partially matches", async () => {
  const transport = new InMemoryUserTransport([
    { id: "partial", primaryEmail: "manager+other@example.com" },
  ]);

  const identity = await findOrCreateLogtoAdminIdentity(
    {
      email: "manager@example.com",
      fullName: "New Manager",
      password: "temporary-password",
    },
    transport,
  );

  assert.equal(identity.created, true);
  assert.equal(identity.subject, "user-2");
});

test("a missing identity requires an eight-character temporary password before API mutation", async () => {
  const transport = new InMemoryUserTransport();

  await assert.rejects(
    findOrCreateLogtoAdminIdentity(
      { email: "new@example.com", fullName: "New Manager", password: "short" },
      transport,
    ),
    /en az 8 karakter/i,
  );
  assert.equal(transport.requestedPaths.length, 1);
  assert.equal(transport.createdBodies.length, 0);
});

test("a new identity is created with the intended Logto user fields", async () => {
  const transport = new InMemoryUserTransport();

  const identity = await findOrCreateLogtoAdminIdentity(
    {
      email: "NEW@EXAMPLE.COM",
      fullName: "New Manager",
      password: "temporary-password",
    },
    transport,
  );

  assert.deepEqual(transport.createdBodies, [
    {
      primaryEmail: "new@example.com",
      name: "New Manager",
      password: "temporary-password",
    },
  ]);
  assert.deepEqual(identity, {
    subject: "user-1",
    email: "new@example.com",
    fullName: "New Manager",
    created: true,
  });
});

test("Management API failures do not expose response bodies or bearer tokens", async () => {
  const transport: LogtoManagementTransport = {
    async request() {
      throw new Error("Bearer top-secret full-user-response");
    },
  };

  await assert.rejects(
    findOrCreateLogtoAdminIdentity(
      { email: "manager@example.com", password: "temporary-password" },
      transport,
    ),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.equal(error.message, "Logto admin identity lookup failed");
      assert.doesNotMatch(error.message, /top-secret|full-user-response/);
      return true;
    },
  );
});
