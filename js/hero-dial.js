// Homepage "password" dial: the numbers 1-10 sit evenly on a circle around
// the Medusa. Pressing them in the right order opens the info page. A wrong
// first press only flashes red; any wrong press after that sends the Medusa
// away (its entrance played in reverse) and the numbers with it. Reload the
// page to try again.
(function () {
  "use strict";

  var dial = document.getElementById("hero-dial");
  if (!dial) return;

  var SEQUENCE = [1, 2, 3, 4, 5, 6, 7, 8];
  var NEXT_PAGE = "about.html";
  var NUMBERS = 10;
  var APPEAR_DELAY_MS = 1800; // numbers fade in as the bust finishes assembling

  var prompt = document.getElementById("hero-prompt");
  var step = 0;
  var presses = 0;
  var locked = false;

  // a fresh random arrangement of the numbers around the circle on every visit
  var slots = [];
  for (var s = 0; s < NUMBERS; s++) slots.push(s);
  for (var sh = slots.length - 1; sh > 0; sh--) {
    var pick = Math.floor(Math.random() * (sh + 1));
    var tmp = slots[sh]; slots[sh] = slots[pick]; slots[pick] = tmp;
  }

  for (var n = 1; n <= NUMBERS; n++) {
    var slot = slots[n - 1]; // slot 0 is the top, then clockwise
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "hero-num";
    btn.textContent = String(n);
    btn.setAttribute("aria-label", "Number " + n);
    btn.style.setProperty("--angle", (slot * 360 / NUMBERS) + "deg");
    btn.style.setProperty("--i", String(slot)); // fade in clockwise around the circle
    btn.addEventListener("click", onPress.bind(null, n, btn));
    dial.appendChild(btn);
  }

  setTimeout(function () {
    dial.classList.add("is-shown");
    if (prompt) prompt.classList.add("is-shown");
  }, APPEAR_DELAY_MS);

  function onPress(n, btn) {
    if (locked) return;
    presses++;
    if (n === SEQUENCE[step]) {
      btn.classList.add("is-hit");
      step++;
      if (step === SEQUENCE.length) {
        locked = true;
        dial.classList.add("is-solved");
        setTimeout(function () { window.location.href = NEXT_PAGE; }, 700);
      }
      return;
    }
    // the very first press is forgiven: flash it red and keep waiting for 1
    if (presses === 1) {
      btn.classList.remove("is-miss");
      void btn.offsetWidth; // restart the flash animation
      btn.classList.add("is-miss");
      return;
    }
    locked = true;
    dial.classList.add("is-gone");
    if (prompt) prompt.classList.add("is-gone");
    if (window.medusaHero) window.medusaHero.disappear();
  }
})();
