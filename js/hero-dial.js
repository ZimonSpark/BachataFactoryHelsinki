// Homepage "password" dial: the numbers 1-10 sit evenly on a circle around
// the Medusa. Pressing them in the right order opens the info page; one wrong
// press sends the Medusa away (its entrance played in reverse) and the numbers
// with it. Reload the page to try again.
(function () {
  "use strict";

  var dial = document.getElementById("hero-dial");
  if (!dial) return;

  var SEQUENCE = [1, 2, 3, 4, 5, 6, 7, 8];
  var NEXT_PAGE = "about.html";
  var NUMBERS = 10;
  var APPEAR_DELAY_MS = 1800; // numbers fade in as the bust finishes assembling

  var step = 0;
  var locked = false;

  for (var n = 1; n <= NUMBERS; n++) {
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "hero-num";
    btn.textContent = String(n);
    btn.setAttribute("aria-label", "Number " + n);
    // 1 at the top, then clockwise
    btn.style.setProperty("--angle", ((n - 1) * 360 / NUMBERS) + "deg");
    btn.style.setProperty("--i", String(n - 1));
    btn.addEventListener("click", onPress.bind(null, n, btn));
    dial.appendChild(btn);
  }

  setTimeout(function () { dial.classList.add("is-shown"); }, APPEAR_DELAY_MS);

  function onPress(n, btn) {
    if (locked) return;
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
    locked = true;
    dial.classList.add("is-gone");
    if (window.medusaHero) window.medusaHero.disappear();
  }
})();
