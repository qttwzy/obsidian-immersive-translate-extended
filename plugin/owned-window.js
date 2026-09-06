"use strict";

function presentWindow(ownedWindow) {
  try {
    if (typeof ownedWindow.isMinimized === "function" && ownedWindow.isMinimized() && typeof ownedWindow.restore === "function") {
      ownedWindow.restore();
    }
  } catch (error) {}
  try { if (typeof ownedWindow.show === "function") ownedWindow.show(); } catch (error) {}
  try { if (typeof ownedWindow.focus === "function") ownedWindow.focus(); } catch (error) {}
}

module.exports = { presentWindow: presentWindow };
