# iPhone: "FitCoach Sync" Shortcut (version 2, 21 Oct 2026)

iPhone users use FitCoach as a home-screen web app, which can't read Apple Health. An Apple
Shortcut reads the numbers and posts them to the `health-sync` Edge Function.

Version 2 adds:
- **One-tap connect:** the app opens the Shortcut with the person's connection code; the
  Shortcut saves it in a file, so nobody pastes anything.
- **Sync now:** the app opens the Shortcut (no code needed after connecting).
- **Today and yesterday** in every run (a 7 AM run completes the previous evening).
- **Watch-worn hours:** the hours that have heart-rate data, so FitCoach doesn't count a
  workout twice (see `resolveBurn` in `src/features/activity/model.ts`).

You (the owner) build it **once**, share the iCloud link, and put the link in `src/config.ts`
(`IPHONE_SHORTCUT_URL`). The name must be exactly **FitCoach Sync** – the app opens it by name.

## Build it (about 15 minutes, on the iPhone)

Delete the old "FitCoach Sync" first (press and hold → Delete). Then **Shortcuts → +**, name it
**FitCoach Sync**. To add an action, tap **Search Actions** at the bottom and type its name. To
use a value from an earlier step, tap the field and pick the blue variable (or **Select
Variable**). To rename a step's result: tap the result in a later field → **Rename**, or add
**Set Variable** after the step.

### Part A – the connection code

1. Tap the **ⓘ** (Details) at the bottom → turn on **Show in Share Sheet** → back. A first
   block **Receive _Any_ input from _Share Sheet_** appears at the top. Tap _Any_ → choose
   only **Text**. Tap **If there's no input** → **Continue**.
   (Then you can turn Show in Share Sheet off again in ⓘ – the block stays and still receives
   the code from the app.)
2. **If** – _Shortcut Input_ **has any value**.
   - inside the If: **Save File** – file: _Shortcut Input_. Tap the arrow (Show More): **Ask
     Where to Save** off, Destination Path `fitcoach-code.txt`, **Overwrite If File Exists** on.
   - leave **Otherwise** empty.
3. **Get File from Folder** – folder **Shortcuts**, path `fitcoach-code.txt`, **Error If Not
   Found** off.
4. **If** – _File_ **does not have any value**:
   - **Ask for Input** – Text, prompt `Paste your FitCoach code (Me → Health sync)`.
   - **Save File** – _Provided Input_, same settings as step 2.
   - **Set Variable** `Code` to _Provided Input_.
   - **Otherwise:** **Get Text from Input** – _File_ → **Set Variable** `Code` to _Text_.
   - End If.

### Part B – today and yesterday

5. **Repeat** `2` times. Everything below up to step 13 goes **inside** the Repeat.
6. **Calculate** – _Repeat Index_ **−** `1` → **Set Variable** `DaysAgo`.
7. **Adjust Date** – **Subtract** _DaysAgo_ **days** from **Current Date**. Then a second
   **Adjust Date** – tap _Add_ and pick **Get Start of Day**, date = _Adjusted Date_ →
   **Set Variable** `DayStart`.
8. **Adjust Date** – **Add** `1` **day** to _DayStart_ → **Set Variable** `DayEnd`.
9. **Find Health Samples** – Type **Active Energy**; filter **Start Date is between**
   _DayStart_ and _DayEnd_; Show More → Group By **Day**, Fill Missing off →
   **Calculate Statistics** – **Sum** of _Health Samples_ → **Set Variable** `Active`.
10. Same as 9 with **Resting Energy** → `Resting`.
11. Same as 9 with **Steps** → `Steps`.
12. **Watch hours:** **Find Health Samples** – **Heart Rate**, Start Date between _DayStart_
    and _DayEnd_, Group By **Hour**, Fill Missing off. Then:
    - **Repeat with Each** item in _Health Samples_:
      - **Get Details of Health Sample** – **Start Date** of _Repeat Item_.
      - **Format Date** – _Start Date_, Date Format **Custom**, `H`.
    - End Repeat.
    - **Combine Text** – _Repeat Results_ with **Custom** `,` → **Set Variable** `WornHours`.
13. **Get Contents of URL** –
    `https://updctclaxbawgtrhtdor.supabase.co/functions/v1/health-sync`. Show More:
    - Method **POST**
    - Headers: `X-Sync-Token` = _Code_, `Content-Type` = `application/json`
    - Request Body **JSON**:
      - `active_calories` (Number) = _Active_
      - `resting_calories` (Number) = _Resting_
      - `steps` (Number) = _Steps_
      - `days_ago` (Number) = _DaysAgo_
      - `worn_hours` (Text) = _WornHours_
14. **End Repeat.**
15. (Optional) **Show Notification** – `FitCoach synced ✓`.

Sleep is left out of version 2 (it isn't used in calories). Add it back later if wanted.

### Share it

**Share → Copy iCloud Link**. Send the link to Claude (or put it in `src/config.ts`
`IPHONE_SHORTCUT_URL` and redeploy). In the Shortcut's ⓘ, **Import Questions** must be
**empty** (version 1 asked for the code there).

## What each person does (shown in the app: Me → Health sync)

1. **Get "FitCoach Sync"** → Add Shortcut (delete an older one first).
2. **Connect** → **Finish in Shortcuts** → Allow Health access and Allow sending to FitCoach.
3. Shortcuts → Automation → + → Time of Day **10:00 PM**, Daily → **Run Immediately** →
   FitCoach Sync. Again for **7:00 AM**.

Afterwards: **Sync now** on Today (calories card) or Me → Health sync runs it any time;
"Last synced" shows on both and to the trainer.

## Notes

- The function accepts the last 7 days, max 40 calls per day per person, and replaces that
  day's numbers each time (`source = apple_shortcut`).
- `worn_hours` empty = no heart-rate data that day = no watch. If someone refuses heart-rate
  access, FitCoach can't tell and may add logged workouts on top of the watch's numbers.
- Errors come back as JSON `{ "error": { "message": … } }` – add **Show Result** after step 13
  while testing.
- "Connect again" in the app makes a new code; the old one stops working at once.
