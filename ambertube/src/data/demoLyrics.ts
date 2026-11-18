// Original lyrics written for the AmberTube demo catalogue (owned by this project, free to display).
// Stored in LRC format so they exercise the synced-lyrics path.

export const DEMO_LYRICS: Record<string, { lrc?: string; plain?: string; instrumental?: boolean }> = {
  'demo:07': {
    lrc: `[00:00.00]♪
[00:08.00]Low sun on the harbour wall
[00:14.50]Gulls are drawing circles in the gold
[00:21.00]I left my worries at the station
[00:27.50]Let the evening do what it was told
[00:35.00]♪
[00:40.00]Hold on to the sunset groove
[00:46.00]Slow it down, there's nothing left to prove
[00:52.50]Every wave is rolling back to you
[00:59.00]Hold on to the sunset groove
[01:06.00]♪
[01:20.00]Neon signs are waking up in pairs
[01:26.50]Someone's humming on the boardwalk stairs
[01:33.00]Salt and amber, shadows getting long
[01:39.50]Every little minute is a song
[01:46.00]♪
[01:52.00]Hold on to the sunset groove
[01:58.00]Slow it down, there's nothing left to prove
[02:04.50]Every wave is rolling back to you
[02:11.00]Hold on to the sunset groove
[02:18.00]♪
[02:40.00]And when the light is gone
[02:46.00]We'll keep the rhythm on
[02:52.50]Hold on…
[03:00.00]Hold on to the sunset groove
[03:06.50]Every wave is rolling back to you
[03:14.00]♪`,
  },
  'demo:11': {
    lrc: `[00:00.00]♪
[00:06.00]Kettle singing, frost upon the pane
[00:12.00]Pine smoke drifting down the lane
[00:18.00]Boots beside the door, the fire's low
[00:24.00]Nowhere else I'd rather go
[00:31.00]♪
[00:36.00]Oh, these cabin mornings
[00:42.00]Slow and gold and new
[00:48.00]Oh, these cabin mornings
[00:54.00]Wake me up with you
[01:01.00]♪
[01:10.00]Chickadees are arguing outside
[01:16.00]Snow has made the meadow wide
[01:22.00]Coffee in a chipped enamel cup
[01:28.00]Sun is slowly climbing up
[01:35.00]♪
[01:40.00]Oh, these cabin mornings
[01:46.00]Slow and gold and new
[01:52.00]Oh, these cabin mornings
[01:58.00]Wake me up with you
[02:06.00]♪`,
  },
  'demo:19': {
    plain: `I kept the letters in a shoebox
Underneath the winter coats
Every one of them still folded
Like the night you wrote

Ink gone pale along the edges
Coffee rings on every page
You said "see you in September"
Then the seasons changed

And I don't read them anymore
I just know that they are there
Like a light left in the hallway
Like a chair beside a chair

Letters I kept
Words I never said
Letters I kept
Instead`,
  },
  'demo:18': {
    lrc: `[00:00.00]♪
[00:05.00]Window open, radio on
[00:09.50]Every grey cloud's packed and gone
[00:14.00]Paint the hallway, call a friend
[00:18.50]Make the weekend never end
[00:23.00]Throw it up, morning confetti
[00:27.50]Ready or not, we're ready
[00:32.00]Throw it up, morning confetti
[00:36.50]Spinning around, steady
[00:41.00]♪`,
  },
};

const INSTRUMENTAL_TAGS = ['lofi', 'ambient', 'jazz', 'rain', 'drone', 'synthwave', 'workout', 'focus'];

export function demoLyricsFor(id: string, tags: string[] = []): { lrc?: string; plain?: string; instrumental?: boolean } | null {
  if (DEMO_LYRICS[id]) return DEMO_LYRICS[id];
  if (tags.some((t) => INSTRUMENTAL_TAGS.includes(t))) return { instrumental: true };
  return null;
}
