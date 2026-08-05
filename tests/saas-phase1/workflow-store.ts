import {
  InMemoryRegistrationCompletionStore,
  type RegistrationCompletionStore,
  type StoredRegistrationAttempt,
} from "../../apps/customer-panel/lib/registration-completion.ts";
import type {
  RegistrationAttempt,
  RegistrationAttemptStore,
} from "../../apps/owner/lib/self-serve-registration-orchestrator.ts";

/** Test-only adapter proving both applications share one authoritative workflow record. */
export class SharedInMemoryRegistrationWorkflowStore
  implements RegistrationAttemptStore, RegistrationCompletionStore
{
  readonly #completionStore = new InMemoryRegistrationCompletionStore();
  readonly #stateToId = new Map<string, string>();
  readonly #idToState = new Map<string, string>();
  readonly #expiresAtByState = new Map<string, string>();
  readonly #consumedStates = new Set<string>();

  async save(attempt: RegistrationAttempt): Promise<void>;
  async save(attempt: StoredRegistrationAttempt): Promise<void>;
  async save(attempt: RegistrationAttempt | StoredRegistrationAttempt) {
    if (this.#stateToId.has(attempt.state)) throw new Error("registration_state_conflict");
    if (this.#idToState.has(attempt.id)) throw new Error("registration_attempt_conflict");
    if (this.#consumedStates.has(attempt.state)) throw new Error("registration_attempt_replayed");

    await this.#completionStore.save(structuredClone(attempt));
    this.#stateToId.set(attempt.state, attempt.id);
    this.#idToState.set(attempt.id, attempt.state);
    this.#expiresAtByState.set(attempt.state, attempt.expiresAt);
  }

  async update(attempt: StoredRegistrationAttempt) {
    if (this.#stateToId.get(attempt.state) !== attempt.id) {
      throw new Error("registration_attempt_missing");
    }
    await this.#completionStore.update(attempt);
  }

  async consume(state: string, now = new Date()) {
    if (this.#consumedStates.has(state)) throw new Error("registration_attempt_replayed");
    const id = this.#stateToId.get(state);
    if (!id) throw new Error("registration_attempt_missing");
    const expiresAt = this.#expiresAtByState.get(state);
    if (!expiresAt || Date.parse(expiresAt) <= now.getTime()) {
      throw new Error("registration_attempt_expired");
    }
    const attempt = await this.#completionStore.findById(id, now);
    if (!attempt) throw new Error("registration_attempt_missing");
    this.#consumedStates.add(state);
    return structuredClone(attempt) as RegistrationAttempt;
  }

  async findByState(state: string, now: Date) {
    return this.#completionStore.findByState(state, now);
  }

  async findById(id: string, now: Date) {
    return this.#completionStore.findById(id, now);
  }
}
