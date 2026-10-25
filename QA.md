# Hands-on release check

Run `npm ci`, `npm run dev`, then open the printed localhost URL. Automated
checks cover simulation and Chromium, but physical hardware and game feel need
human playtesting. Report the arena, match mode, device, and steps for any problem.

## Five-minute playtest

1. **Combat.** Start Bot Match. Bites deal 20 damage. Lunges now have a visible
   windup, a moving 30-damage strike, and exposed recovery. Try a missed lunge,
   punishing recovery with a bite, retreating from a short-range web, and lunging
   through a web. Confirm the timing is understandable and neither attack feels
   dominant. At close range, a bite should beat a simultaneously started lunge;
   a missed lunge should leave enough time for a bite to punish it.
2. **Recovery.** Drop, let the spider turn upright, then cast silk. Steer during
   the swing and return. Ground impact costs 10 health; remaining on the pavement
   costs 5 more each second. Confirm the upright pose, legs, silk attachment and
   return to the inverted grip look convincing.
   In PvP, move the other spider while one swings; walking, lunge and drop should
   remain available, with walking still stopped at twig ends and gaps.
   On a raised arena, run toward a gap, drop and cast soon while still steering.
   A strong swing can rise above the webbed twig before returning; check for a
   smooth arc rather than an invisible ceiling or a sudden downward snap.
   Start a return tied to the lower twig, steer toward the higher twig and press
   Web again when “Cast higher” appears (C in Bot Match; W for PvP P1, ↑ for P2).
   Confirm a new silk line fires and the final grip reaches the higher twig.
3. **Arenas.** Try One stick, Twin sticks, Stepped sticks and Terraces. At a gap, drop toward the
   other side, fall for about half a second, then cast. The bot can follow. Try
   crossing from both heights, returning under an opponent, and following the
   open-side hint if a climb is blocked.
   On Terraces, drop from either raised starting perch onto the lower center
   stick, fight there, then cross to the opposite perch. Confirm the two gaps
   and center fight feel different from the single crossing on Stepped sticks.
4. **Local PvP.** On the demo laptop, try simultaneous keyboard inputs for P1
   and P2. Keyboards vary in how many keys they can register at once. One standard
   controller plays P2 alongside keyboard/touch P1; two controllers play P1 and P2.
   Test left stick and D-pad, all four face buttons, Start, Back/Share, disconnect,
   reconnect, and returning from pause. D-pad navigates menus; bottom face confirms;
   left/right changes a focused arena picker. Release controls after transitions.
5. **Presentation.** Try your phone in landscape and portrait. Check fighter
   identity, hints, button reachability, arena edges, the hand grip, and the street.
   Listen to bite, lunge, web, impact and round sounds. Toggle mute and button hints,
   reload, and confirm both preferences persist. On a phone, test both players'
   separate touch controls together in landscape. Disabling two touch sets in
   pause requires a controller for P2 when returning to the menu.
6. **Match flow and coaching.** Finish a match: round wins should persist, draws
   should replay without a point, and two wins should finish the series. Confirm
   New match resets the score. Try the first-match move/web/bite coaching, skip
   it, then reload; completion or skipping should be remembered. Rest on the twig
   for three seconds to see the idle bounce; pause should freeze it.

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
npm run test:browser
```

Browser checks cover desktop, a short laptop screen, portrait/landscape phones,
and a production build served under `/damang-damang/`. Virtual controllers verify
input routing and menus; they do not certify a physical controller, Bluetooth
connection, mobile GPU, Safari, or keyboard rollover.
