

# Major App Restructure Plan

## Overview
Restructure the app's navigation, create new pages (Shared Interests, Profile), redesign Home, and reorganize Chat — while preserving all existing feature page logic unchanged.

---

## Technical Approach

The current app uses a single-page architecture with tab-based routing in `Index.tsx`. Groups currently don't distinguish between "Home" (inner circle) and "Shared Interest" (topic-based) types. We'll introduce a `group_category` concept and build new UI layers on top of existing infrastructure.

---

## Step 1: Database — Add Group Category

Add a `category` column to the `groups` table to distinguish group types:
- `home` — inner circle (family, close friends)
- `interest` — shared interest / topic-based groups
- Default existing groups to `home`

**Migration SQL:**
- `ALTER TABLE groups ADD COLUMN category text NOT NULL DEFAULT 'home' CHECK (category IN ('home', 'interest'));`

---

## Step 2: New Bottom Navigation (5 items)

**File: `src/components/BottomNav.tsx`** — Full rewrite of the nav bar.

New fixed 5-item layout (left to right):
1. **Home** (House icon)
2. **Shared Interests** (Compass icon)
3. **AI** (center elevated button — unchanged design)
4. **Chat** (MessageCircle icon)
5. **Profile** (User icon)

Remove all customizable nav page logic (no more drag-to-reorder, no `loadNavPages`/`saveNavPages`). The nav is now static.

Update `Tab` type to: `"home" | "shared-interests" | "ai" | "chat" | "profile" | "more" | "settings"` plus all existing feature page IDs for internal routing.

---

## Step 3: Update Side Drawer

**File: `src/components/AppDrawer.tsx`**

Update drawer items order:
- **Top section**: Home, Shared Interests, Chat, Profile
- **Divider**
- **Feature pages**: Calendar, Workout, Nutrition, Habits, Sobriety, Special Days, Shopping
- **Bottom**: More, Settings

---

## Step 4: Home Page Redesign

**File: `src/components/HomePage.tsx`** — Modify the layout and sections, keeping all existing logic.

**Changes:**
- Group toggle filters to only `home`-category groups
- Update `HomeSectionCustomizer` sections to include:
  - **Today's Schedule** — reuses existing scheduled events section, adds "tap title → Calendar page" behavior and "no events → show upcoming" fallback
  - **To Do List** — unchanged logic, same inline add/check behavior
  - **Habits** — unchanged logic, inline checkable circles
  - **Shared Interest Quick Access** — new compact horizontal scroll of the user's `interest`-category groups with icons; tap → navigate to that group's feature page
- Warmer visual treatment: softer card backgrounds, friendly typography tweaks (CSS only)

**File: `src/components/HomeSectionCustomizer.tsx`** — Add `"shared-interests-quick"` as a new toggleable section.

**File: `src/components/HomeWidgets.tsx`** — Add `HomeSharedInterestsWidget` component.

---

## Step 5: Shared Interests Page (New)

**New file: `src/components/SharedInterestsPage.tsx`**

**Layout — resizable split view:**
- **Top half — My Groups**: Cards grid for `interest`-category groups. Each card shows group name, topic icon, member count. `+ Create/Join` button. Tap → navigate to feature page.
- **Bottom half — Feed**: Activity feed aggregated from all interest groups (workout completions, habit streaks, sobriety check-ins, etc.). Each item: avatar, action, timestamp, group label.
- **Resize controls**: Enlarge/collapse buttons to toggle between 50/50, 75/25, 25/75 splits.
- **Quick access bar**: Horizontally scrollable row of feature shortcut icons (always visible). If user is in multiple groups of same type → show group picker popover.

**Data source for feed**: Query recent entries from `workouts`, `habits`, `sobriety_trackers`, `nutrition_entries`, `special_days` tables filtered to interest-group IDs, sorted by timestamp. Display as a unified feed.

---

## Step 6: Chat Page Restructure

**File: `src/components/ChatListPage.tsx`** — Reorganize into 3 sections.

Split the existing flat group chat list into:
1. **Home Group Chats** — groups where `category = 'home'`
2. **Shared Interest Group Chats** — groups where `category = 'interest'`
3. **Individual DMs** — direct message threads (requires checking for 2-member groups or a DM flag)

Each section has a clear header label. All use the same existing chat preview card rendering. Vertically scrollable.

**Note:** Individual DMs may require identifying groups that function as DMs (2 members, no shared pages) or adding a `is_dm` flag to groups. We'll use member count heuristic initially.

---

## Step 7: Profile Page (New)

**New file: `src/components/ProfilePage.tsx`**

Consolidates profile and settings into one page:
- **Header**: Profile photo (tap to change via existing `EditProfileModal`), display name, username
- **Activity Summary cards**: Habit streaks count, workouts this week, sobriety days, special days count — read from existing app context/queries
- **Settings section**: Reuses settings items from existing `SettingsPage.tsx` (Notifications, Privacy, Appearance, Help, Connected accounts including Google Calendar, Logout)
- **Friends section**: Quick access button that opens the friends list (reuses `FriendRow` and `useFriendships` from LauncherPage)

---

## Step 8: Update Index.tsx Router

**File: `src/pages/Index.tsx`**

- Add new tabs: `"shared-interests"`, `"profile"`
- Update `pages` record to include `SharedInterestsPage` and `ProfilePage`
- Feature pages (workout, nutrition, habits, etc.) remain in the `pages` record for internal navigation from group contexts
- Update `handleTabChange` to handle new tab IDs
- Floating more button remains for accessing feature pages
- Update bottom nav rendering to use the new 5-item nav
- Remove `navPages` customization state (nav is now fixed)

---

## Step 9: Group Creation — Add Category

**File: `src/components/CreateGroupModal.tsx`** — Add a category selector (Home vs Shared Interest) during group creation so new groups are properly categorized.

**File: `src/context/AuthContext.tsx`** — Update `createGroup` to pass `category` field. Update `Group` interface to include `category: 'home' | 'interest'`.

---

## Files Changed Summary

| File | Action |
|------|--------|
| `src/components/BottomNav.tsx` | Rewrite — static 5-item nav |
| `src/components/AppDrawer.tsx` | Update — new item order |
| `src/components/HomePage.tsx` | Modify — filter to home groups, add shared-interests widget |
| `src/components/HomeSectionCustomizer.tsx` | Add shared-interests-quick section |
| `src/components/HomeWidgets.tsx` | Add `HomeSharedInterestsWidget` |
| `src/components/SharedInterestsPage.tsx` | **New** — split view with groups + feed |
| `src/components/ChatListPage.tsx` | Restructure into 3 sections |
| `src/components/ProfilePage.tsx` | **New** — profile + settings + friends |
| `src/pages/Index.tsx` | Update routing, new tabs, remove nav customization |
| `src/components/CreateGroupModal.tsx` | Add category selector |
| `src/context/AuthContext.tsx` | Add `category` to Group interface and createGroup |
| DB migration | Add `category` column to `groups` table |

**Unchanged**: All feature pages (Workout, Nutrition, Habits, Sobriety, Special Days, Shopping, Calendar), LauncherPage, AppContext, all edge functions.

