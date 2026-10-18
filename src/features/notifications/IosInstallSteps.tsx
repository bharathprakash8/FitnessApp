/** "Add to Home Screen" steps for iPhone (used on Notifications and the Today install card). */
export function IosInstallSteps() {
  return (
    <>
      <p>
        On iPhone, notifications work only when FitCoach is added to your Home Screen (iOS 16.4 or
        newer):
      </p>
      <ol className="notif-steps">
        <li>
          Tap the <strong>Share</strong> button (square with an arrow) at the bottom of Safari.
        </li>
        <li>
          Scroll down and tap <strong>Add to Home Screen</strong> → <strong>Add</strong>.
        </li>
        <li>Open FitCoach from the new Home Screen icon and come back to Me → Notifications.</li>
      </ol>
    </>
  );
}
