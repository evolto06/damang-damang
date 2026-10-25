# Submission preparation

Imported from PR #17, which cites `docs/Level Up 3.0 Official Full Mechanics.pdf`, sections I.B.8–11 and forms on pages 10–15. The source PDF is not bundled in this integration; verify these requirements against the official document. This is a working checklist, not a signed
declaration or a submitted entry. Confirm current deadlines with the organizers.

## Team-owned deliverables

- [ ] Form 01: registered team members, roles, institution and adviser details.
- [ ] Form 02: team and adviser review/sign the waiver and originality declaration.
- [ ] Form 03: disclose AI assistance and external libraries/assets. The draft below
      covers this branch; add any earlier development tools and assets.
- [ ] Template 01: game title, team name and a synopsis of at most 500 words.
- [ ] A **1–2 minute MP4 trailer**, suitable for looping at the event.
- [ ] A separate **3–5 minute MP4 gameplay demo**, with optional narration/captions.
- [ ] Verify the submission link, deadline, registration and any category-specific
      eligibility/endorsement requirements. The supplied schedule lists October 25.
- [ ] Complete [QA.md](QA.md) on the demo device and physical controllers.

The official gameplay condition permits PvP or PvE with leaderboards. This project
uses its local PvP mode as its competitive match format, with a 60-second limit,
health-based winner and equal-health draw. Controller support improves the local
demo; the PDF does not specifically mandate controllers.

## Draft synopsis

**Game title:** Damang Damang

**Team name:** To be supplied by the team

Damang Damang is a browser fighting game inspired by spider fighting on twigs in
the Philippines. In a stylized barangay street, two spiders meet above the pavement
for a short contest of timing, spacing and recovery.

Players close in for a precise bite, use short-range web shots to create an opening,
or commit to a lunging strike. A lunge can evade a web, but its windup and recovery
leave opportunities for an opponent to interrupt or punish it. Damaging hits knock
surviving spiders off the twig. Players cast silk, steer a pendulum swing and climb
back into the fight; landing on the pavement costs health.

Four arena options offer a single twig, separated twigs and two alternative raised layouts.
A shared camera follows both fighters. Players can practice against a bot or compete
locally using a split keyboard, controllers, or separate shared-screen touch controls for both players. Nearby
button hints teach the current action, while distinct fighter colors, health displays
and synthesized sounds make combat easier to follow.

Matches are first to two wins, with optional first-match coaching. Each round lasts up to 60 seconds. Reducing an opponent's health to zero wins the
round; at timeout, greater remaining health wins and equal health produces a draw.

## Draft Form 03 notes — review before signing

| Tool / material | Application and extent |
| --- | --- |
| OpenAI Codex | Heavy assistance on this branch: issue analysis, game programming, debugging, procedural visual refinements, balance proposals, tests, and documentation. The original PR reports browser verification; the integrated browser suite still requires execution. Team members must review and accept the work. |
| Three.js and its addons | External rendering/GLB-loading library; MIT license. The production distribution includes its license notice. |
| Vite | External development/build tooling; list it if the form requests development libraries. |
| Playwright and Prettier | External testing/formatting tools added for verification and code readability; development only. |
| Supplied Blender spider and exported GLB | Editable source and exported model are in the repo. Confirm the creator and usage rights with the team; this branch does not establish their provenance. |
| Procedural scene and synthesized audio | Created/modified as code in the project with AI programming assistance; no downloaded image or sound assets were added by this branch. |
| Vibi's Spider Attack Animation1 | Existing motion reference credited in README; no footage or artwork from the video is bundled. Review the reference declaration with the team. |

Add prior AI tools, reused personal libraries, third-party materials, prompts or
records that are not covered here. Preserve the repository history and source assets
for the organizers' review. Only the team can confirm its identities, rights,
declarations and signatures.
