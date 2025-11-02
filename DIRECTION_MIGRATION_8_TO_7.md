# Direction Migration Map: 8 ? 7 Directions

## Overview
This document outlines the migration from 8 growth directions to 7 merged directions, maintaining backward compatibility for user data.

## Migration Summary

### Old 8 Directions ? New 7 Directions

| Old Direction | Old Slug | Action | New Direction | New Slug | Notes |
|--------------|----------|--------|---------------|----------|-------|
| Learning & Knowledge | `learning` | **KEEP** | Learning & Knowledge | `learning` | No change |
| Career & Projects | `career` | **KEEP** | Career & Projects | `career` | No change |
| Finance & Stability | `finance` | **KEEP** | Finance & Stability | `finance` | No change |
| Health & Vitality | `health` | **KEEP** | Health & Vitality | `health` | No change |
| Relationships & Family | `relationships` | **KEEP** | Relationships & Family | `relationships` | No change |
| Community & Society | `community` | **KEEP** | Community & Society | `community` | No change |
| Creativity & Expression | `creativity` | **KEEP** | Creativity & Expression | `creativity` | No change |
| Mindfulness & Inner Balance | `mindfulness` | **MERGE INTO** | Mindfulness & Purpose | `mindfulness_purpose` | Merged with purpose |
| Meaning & Purpose | `purpose` | **MERGE INTO** | Mindfulness & Purpose | `mindfulness_purpose` | Merged with mindfulness |

## Merged Direction Details

### Mindfulness & Purpose (merged)
- **Old slugs merged**: `mindfulness`, `purpose`
- **New slug**: `mindfulness_purpose`
- **New title**: "Mindfulness & Purpose"
- **Emoji**: ??
- **Description**: Covers awareness, balance, and personal meaning
- **Type**: Additional

**Merged tasks from:**
- Mindfulness: Meditate 5-10m, Micro-breaks, Stress checks, Reflect in journal, Review goals, Seek feedback, Retreats, Build habits, Quit bad habits, Personality tests, Hit personal goals, Courageous steps
- Purpose: Review purpose, Value check, Integrity audit, Write mission, Letter to future self, Value-driven acts

## Data Migration

### User Data Compatibility

All user data is automatically migrated:

1. **user_selected_directions**: Old direction IDs are mapped to new direction ID
   - `mindfulness` ? `mindfulness_purpose`
   - `purpose` ? `mindfulness_purpose`

2. **growth_tasks**: All tasks from merged directions are reassigned to new direction
   - Mindfulness tasks ? Mindfulness & Purpose
   - Purpose tasks ? Mindfulness & Purpose

3. **user_tasks**: Automatically migrated via task reassignment (no user action needed)

4. **sw_ledger**: SW points are preserved by mapping old direction IDs to new one

5. **Duplicate removals**: If a user had both mindfulness and purpose selected, duplicates are removed

## Backward Compatibility

The frontend code includes legacy mappings for old slugs:
- `mindfulness` ? `mindfulness_purpose` (emoji: ??)
- `purpose` ? `mindfulness_purpose` (emoji: ??)
- `personal` ? `mindfulness_purpose` (emoji: ??) - from previous merge

This ensures that any cached references to old slugs will still work correctly.

## File Changes

### Database Migrations
- `125_merge_mindfulness_purpose.sql`: Main migration script
- `126_seed_7_directions.sql`: Updated seed data with 7 directions

### Frontend Updates
- `app/(auth)/growth-directions/page.tsx`: Updated emoji map with legacy support (needs manual update)
- `app/(auth)/growth/[slug]/page.tsx`: Updated emoji map
- `app/(auth)/growth/page.tsx`: Updated emoji map

## Final 7 Directions

1. **Learning & Knowledge** ?? (merged from learning, education, digital)
2. **Career & Projects** ??
3. **Finance & Stability** ??
4. **Health & Vitality** ??
5. **Relationships & Family** ??
6. **Community & Society** ??
7. **Creativity & Expression** ??
8. **Mindfulness & Purpose** ?? (merged from mindfulness, personal, purpose)

## Complete Migration Path: 12 ? 8 ? 7

### Step 1: 12 ? 8 (Previous migration)
- Merged: `education` + `digital` ? `learning`
- Merged: `personal` ? `mindfulness`
- Renamed: `health` ? "Health & Vitality"
- Renamed: `mindfulness` ? "Mindfulness & Inner Balance"

### Step 2: 8 ? 7 (Current migration)
- Merged: `mindfulness` + `purpose` ? `mindfulness_purpose`

### Final State
- 7 active directions
- All legacy slugs (`education`, `digital`, `personal`, `mindfulness`, `purpose`) mapped for backward compatibility
