import { ClassifierService, ClassifiableEvent } from './classifier.service';

function evt(overrides: Partial<ClassifiableEvent>): ClassifiableEvent {
  return {
    activity_type: 'other',
    activity_name: 'Something',
    metadata: null,
    ...overrides,
  };
}

describe('ClassifierService', () => {
  let service: ClassifierService;

  beforeEach(() => {
    service = new ClassifierService();
  });

  describe('does not override a confident client', () => {
    // The client knows things the server can't infer. Only its explicit fallbacks
    // ('other' on Windows, 'application' on Android) are open to reinterpretation.
    it.each(['coding', 'notification', 'screen', 'idle', 'media', 'browsing'])(
      'leaves %s untouched',
      (type) => {
        const e = evt({ activity_type: type, metadata: { process_name: 'chrome.exe' } });
        expect(service.classify(e)).toBe(type);
      }
    );
  });

  describe('Windows process names (real values from prod)', () => {
    // These are the actual top 'other' processes observed in the database.
    it.each([
      ['Cursor', 'coding'],
      ['claude', 'coding'],
      ['Antigravity', 'coding'],
      ['GitHubDesktop', 'coding'],
      ['Code.exe', 'coding'],
      ['WindowsTerminal', 'coding'],
      ['TickTick', 'productivity'],
      ['chrome.exe', 'browsing'],
      ['Slack', 'communication'],
      ['olk', 'communication'],
      ['Spotify', 'media'],
      ['figma', 'design'],
      ['explorer', 'system'],
      ['SearchHost', 'system'],
    ])('classifies %s as %s', (process, expected) => {
      expect(service.classify(evt({ metadata: { process_name: process } }))).toBe(expected);
    });

    it('strips the .exe suffix case-insensitively', () => {
      expect(service.classify(evt({ metadata: { process_name: 'CURSOR.EXE' } }))).toBe('coding');
    });

    it('leaves a genuinely unknown process as-is', () => {
      expect(service.classify(evt({ metadata: { process_name: 'javaw' } }))).toBe('other');
    });
  });

  describe('Android package names', () => {
    // The Android client matches localized app LABELS by exact set membership, so
    // "Google Chrome" misses "chrome" and lands in 'application'. Packages are stable.
    it.each([
      ['com.android.chrome', 'browsing'],
      ['com.google.android.youtube', 'media'],
      ['com.spotify.music', 'media'],
      ['com.instagram.android', 'communication'],
      ['com.whatsapp', 'communication'],
      ['com.google.android.apps.docs', 'productivity'],
      ['com.github.android', 'coding'],
    ])('classifies %s as %s', (pkg, expected) => {
      expect(
        service.classify(evt({ activity_type: 'application', metadata: { package_name: pkg } }))
      ).toBe(expected);
    });

    it('leaves an unknown package as application', () => {
      expect(
        service.classify(
          evt({ activity_type: 'application', metadata: { package_name: 'com.hevy.app' } })
        )
      ).toBe('application');
    });
  });

  describe('applyTo', () => {
    it('preserves the original type in metadata so a backfill is reversible', () => {
      const e = evt({ activity_type: 'other', metadata: { process_name: 'Cursor' } });
      service.applyTo(e);
      expect(e.activity_type).toBe('coding');
      expect(e.metadata?.original_activity_type).toBe('other');
      expect(e.metadata?.process_name).toBe('Cursor');
    });

    it('leaves metadata alone when nothing changes', () => {
      const e = evt({ activity_type: 'coding', metadata: { process_name: 'Cursor' } });
      service.applyTo(e);
      expect(e.metadata?.original_activity_type).toBeUndefined();
    });

    it('is idempotent — a second pass is a no-op', () => {
      const e = evt({ activity_type: 'other', metadata: { process_name: 'Cursor' } });
      service.applyTo(e);
      const afterFirst = { ...e, metadata: { ...e.metadata } };
      service.applyTo(e);
      expect(e.activity_type).toBe(afterFirst.activity_type);
      expect(e.metadata?.original_activity_type).toBe('other');
    });

    it('survives null metadata', () => {
      const e = evt({ activity_type: 'other', metadata: null, activity_name: 'Unknown' });
      expect(() => service.applyTo(e)).not.toThrow();
      expect(e.activity_type).toBe('other');
    });
  });
});
