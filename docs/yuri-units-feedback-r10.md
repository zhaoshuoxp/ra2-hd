# Yuri R10 feedback corrections

The Chaos Drone deploy slot selected the unusable secondary scanner. Vehicle deploy now resolves its usable native AreaFire gas weapon, and manual attacks retain the same weapon. Nearby enemies become berserk while the distant control remains unaffected.

The disc previously spun by its fast 140.625-degree targeting ROT every tick. Idle spin now uses 11.25 degrees per tick, with adjacent HD headings blended over a complete opaque base. Eight native flight bearings, turns, circumference sweep, outgoing ray and effect cleanup pass.

Gattling Tank native weapon stages already worked. Add gun-face rotation at increasing visual rates and attach its native MGUN/GUNFIRE/VTMUZZLE flashes to the displayed paired barrel tips. Heat, damage, burst and firing intervals retain retail behavior; stopping resets heat and rotation.

Yuri Prime had inconsistent authored walk bodies. An additive r4 atlas uses the accepted phase-zero rigid body per facing, proportionally fitted by approximately 95–98 percent inside the shared native trims. The full human and platform remain stable across all six phases. Native frame indices, geometry, timing and below-body ground shadows remain selected. All 480 non-walk density slots and 176 master files remain unchanged.

Magnetron direct building damage and landing outcomes were already functional. The selected app reduces construction-yard HP from 1000 to 760 with three native attacks. A 400-HP tank safely lands on clear ground; dropping onto a 400-HP tank destroys both; dropping onto a 750-HP power plant leaves it at 350 and destroys the falling tank; dropping that land tank into water destroys it. Keep the user's normal translucent field and original landing policy.

Twenty-one focused tests pass 171 expectations, entry type checking passes, and final copied-app 2x/4x cases pass without recorded errors. Source and copied resource validation cover independent densities and complete-family fallback; a separate pixel comparison checks every hover slot. Eleven videos are embedded and fully decoded. Browser UI playback is NOT_RUN. The full macOS ARM64 test ZIP is prepared separately; main integration and Windows validation remain separate. Revised movement and attack visuals await user acceptance. Continue fixes and acceptance in this execution conversation.
