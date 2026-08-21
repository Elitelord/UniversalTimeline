import { Injectable } from '@nestjs/common';

/**
 * Server-side activity classification.
 *
 * Classification originally lived only in the clients — ActivityTracker.ClassifyActivity
 * on Windows and UsageTracker.classifyActivity on Android. That has two problems:
 * fixing a misclassification means shipping a new .exe and .apk, and historical rows
 * stay wrong forever. Doing it here means one place to fix and the ability to backfill.
 *
 * This runs only over events a client already gave up on — Windows sends 'other' and
 * Android sends 'application' as their fallbacks. A client that confidently reports
 * 'coding' or 'notification' is trusted and left alone, so this can never override a
 * more specific classification with a worse guess.
 */

/** Fallback types, i.e. "the client didn't know". Only these get reclassified. */
const RECLASSIFIABLE = new Set(['other', 'application', '']);

/**
 * Windows process names (lowercased, no .exe) → activity type.
 *
 * The client-side list predates Cursor, Claude Code and Antigravity, which together
 * accounted for 186 of the 397 'other' events in the data.
 */
const PROCESS_RULES: ReadonlyArray<[RegExp, string]> = [
  [/^(chrome|firefox|msedge|brave|opera|vivaldi|arc|iexplore|chromium|zen|librewolf)$/, 'browsing'],
  [
    /^(code|code - insiders|codium|cursor|windsurf|antigravity|claude|devenv|idea64|idea|rider64|rider|webstorm64|pycharm64|clion64|goland64|studio64|sublime_text|nvim|vim|emacs)$/,
    'coding',
  ],
  [/^(windowsterminal|cmd|powershell|pwsh|wt|alacritty|hyper|wezterm|githubdesktop|git-gui|gitkraken|docker desktop)$/, 'coding'],
  [/^(slack|discord|teams|ms-teams|zoom|telegram|signal|whatsapp|thunderbird|outlook|olk|skype|webex)$/, 'communication'],
  [/^(figma|photoshop|illustrator|sketch|xd|inkscape|gimp|blender|afterfx|premiere|affinity ?\w*)$/, 'design'],
  [
    /^(notion|obsidian|onenote|evernote|winword|excel|powerpnt|acrobat|acrord32|ticktick|todoist|anki|zotero|calendar)$/,
    'productivity',
  ],
  [/^(spotify|vlc|mpc-hc64|itunes|music|potplayermini64|netflix|wmplayer)$/, 'media'],
];

/**
 * Android package substrings → activity type.
 *
 * The Android client matches on the localized app *label* by exact set membership,
 * so "Google Chrome" fails to match "chrome" and falls through to 'application'.
 * Package names are stable and locale-independent, so match on those instead.
 */
const PACKAGE_RULES: ReadonlyArray<[RegExp, string]> = [
  [/(^|\.)(chrome|firefox|brave|opera|duckduckgo|samsung\.android\.app\.sbrowser)($|\.)|browser/, 'browsing'],
  [
    /(whatsapp|telegram|signal|discord|slack|messenger|instagram|snapchat|gm$|android\.gm|outlook|teams|messaging|android\.apps\.messaging|linkedin|twitter|android\.talk)/,
    'communication',
  ],
  [/(youtube|netflix|spotify|tiktok|twitch|hulu|disney|primevideo|soundcloud|podcast)/, 'media'],
  [
    /(docs|sheets|slides|drive|calendar|keep|notion|obsidian|evernote|todoist|ticktick|onenote|office)/,
    'productivity',
  ],
  [/(github|termux|jetbrains|androidide|replit)/, 'coding'],
];

/** Names that aren't really user activity — shells, launchers, system UI. */
const SYSTEM_PROCESSES = /^(explorer|searchhost|shellexperiencehost|dwm|sihost|taskmgr|lockapp|applicationframehost|systemsettings|startmenuexperiencehost)$/;

export interface ClassifiableEvent {
  activity_type: string;
  activity_name: string;
  metadata?: Record<string, any> | null;
}

@Injectable()
export class ClassifierService {
  /**
   * Returns the best activity type for an event, or its existing type unchanged when
   * the client already made a confident call or nothing here matches.
   */
  classify(event: ClassifiableEvent): string {
    const current = (event.activity_type ?? '').toLowerCase();
    if (!RECLASSIFIABLE.has(current)) {
      return event.activity_type;
    }

    const process = String(event.metadata?.process_name ?? '')
      .replace(/\.exe$/i, '')
      .trim()
      .toLowerCase();

    if (process) {
      if (SYSTEM_PROCESSES.test(process)) return 'system';
      for (const [pattern, type] of PROCESS_RULES) {
        if (pattern.test(process)) return type;
      }
    }

    const pkg = String(event.metadata?.package_name ?? '').trim().toLowerCase();
    if (pkg) {
      for (const [pattern, type] of PACKAGE_RULES) {
        if (pattern.test(pkg)) return type;
      }
    }

    // Last resort: the display name. Weakest signal — it is localized and free-form —
    // so it only runs when there is no process or package name to go on.
    const name = String(event.activity_name ?? '').trim().toLowerCase();
    if (name) {
      for (const [pattern, type] of PROCESS_RULES) {
        if (pattern.test(name)) return type;
      }
    }

    return event.activity_type;
  }

  /**
   * Classifies in place, preserving the client's original value in metadata so the
   * change is auditable and a backfill can be undone.
   */
  applyTo<T extends ClassifiableEvent>(event: T): T {
    const next = this.classify(event);
    if (next === event.activity_type) return event;

    event.metadata = {
      ...(event.metadata ?? {}),
      original_activity_type: event.activity_type,
    };
    event.activity_type = next;
    return event;
  }
}
