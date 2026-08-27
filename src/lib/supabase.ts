// Temporary UI compatibility bridge. This file does not use Supabase.
// It maps the existing UI auth/realtime calls to Appwrite while the UI is refactored.
import { hasActiveSession, isCloudConfigured, signIn, signOut, signUp } from './appwrite';
import { subscribeToCloudChanges } from './cloud';

type AuthListener = (event: string, session: object | null) => void;
const listeners = new Set<AuthListener>();

function emit(event: string, authenticated: boolean) {
  const session = authenticated ? {} : null;
  listeners.forEach((listener) => listener(event, session));
}

class AppwriteChannelBridge {
  private callbacks: Array<() => void> = [];
  private cleanup: null | (() => Promise<void>) = null;

  on(_event: string, _filter: unknown, callback: () => void) {
    this.callbacks.push(callback);
    return this;
  }

  subscribe() {
    subscribeToCloudChanges(() => this.callbacks.forEach((callback) => callback()))
      .then((cleanup) => { this.cleanup = cleanup; })
      .catch(() => undefined);
    return this;
  }

  async close() {
    await this.cleanup?.();
  }
}

export { isCloudConfigured };

export const supabase = isCloudConfigured ? {
  auth: {
    async signInWithPassword({ email, password }: { email: string; password: string }) {
      try {
        await signIn(email, password);
        emit('SIGNED_IN', true);
        return { data: { session: {} }, error: null };
      } catch (error) {
        return { data: { session: null }, error };
      }
    },
    async signUp({ email, password }: { email: string; password: string }) {
      try {
        await signUp(email, password);
        emit('SIGNED_IN', true);
        return { data: { session: {} }, error: null };
      } catch (error) {
        return { data: { session: null }, error };
      }
    },
    async getSession() {
      const active = await hasActiveSession();
      return { data: { session: active ? {} : null } };
    },
    onAuthStateChange(callback: AuthListener) {
      listeners.add(callback);
      return { data: { subscription: { unsubscribe: () => listeners.delete(callback) } } };
    },
    async signOut() {
      await signOut();
      emit('SIGNED_OUT', false);
    },
  },
  channel(_name: string) {
    return new AppwriteChannelBridge();
  },
  async removeChannel(channel: AppwriteChannelBridge) {
    await channel.close();
  },
} : null;
