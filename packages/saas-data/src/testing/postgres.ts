import {
  PostgresSaaSDataRepository,
  registerPostgresTestFailure,
  type PostgresFailurePoint,
  type PostgresRepositoryOptions,
} from "../postgres/repository.ts";

export interface PostgresTestingFaultOptions { failAt: PostgresFailurePoint; }

export function createPostgresSaaSDataRepositoryForTesting(
  options: PostgresRepositoryOptions,
  fault: PostgresTestingFaultOptions,
): PostgresSaaSDataRepository {
  registerPostgresTestFailure(options, fault.failAt);
  return new PostgresSaaSDataRepository(options);
}

export type { PostgresFailurePoint };
