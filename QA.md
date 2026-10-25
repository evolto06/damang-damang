# Hands-on release check

Run `npm ci`, `npm run dev`, then open the printed localhost URL. Automated
checks cover simulation and Chromium, but physical hardware and game feel need
human playtesting. Report the arena, match mode, device, and steps for any problem.

## Five-minute playtest

1. **Combat.** Start Bot Match. Bites deal 20 damage. Lunges now have a visible
   windup, a moving 30-damage strike, and exposed recovery. Try a missed lunge,
   punishing recovery with a bite, retreating from a short-range web, and lunging
   through a web. Confirm the timing is understandable and neither attack feels
   dominant. Bites can still interrupt a lunge.
2. **Recovery.** Drop, let the spider turn upright, then cast silk. Steer during
   the swing and return. Ground impact costs 10 health; remaining on the pavement
   costs 5 more each second. Confirm the upright pose, legs, silk attachment and
   return to the inverted grip look convincing.
3. **Arenas.** Try One stick, Twin sticks, Terraces and the retained Stepped sticks. At a gap, drop toward the
   other side, fall for about half a second, then cast. The bot can follow. Try
   crossing from both heights, returning under an opponent, and following the
   open-side hint if a climb is blocked.
4. **Local PvP.** On the demo laptop, try simultaneous keyboard inputs for P1
   and P2. Keyboards vary in how many keys they can register at once. The first controller plays P1 and the next plays P2; keyboard and touch stay active alongside them.
   Test left stick and D-pad, all four face buttons, Start, disconnect,
   reconnect, and returning from pause. D-pad navigates menus; bottom face confirms;
   left/right changes a focused arena picker. Release controls after transitions.
5. **Presentation.** Try your phone in landscape and portrait. Check fighter
   identity, hints, button reachability, arena edges, the hand grip, and the street.
   Listen to bite, lunge, web, impact and round sounds. Toggle mute and button hints,
   reload, and confirm both preferences persist. On a phone, enable Two-player touch and test both panels without a controller. Check first-to-two scoring, drawn rounds, new matches, and optional coaching.

## Repository administrator

After the PR passes and is merged, verify that Settings → Pages uses **GitHub
Actions**, then open the deployed game and repeat a short loading/play check.
Protect `main` with a required PR and the CI `test` check. These are repository
settings, not changes this branch can enforce. Confirm the intended project/model
license before distributing a release; the repo currently grants no project-wide
license.

## Automated checks

```sh
npm run format:check
npm test
npm run build
node scripts/check-deployment.mjs
npx playwright install chromium
npm run test:smoke
```

Browser checks cover desktop, a short laptop screen, portrait/landscape phones,
and a production build served under `/damang-damang/`. Virtual controllers verify
input routing and menus; they do not certify a physical controller, Bluetooth
connection, mobile GPU, Safari, or keyboard rollover.
