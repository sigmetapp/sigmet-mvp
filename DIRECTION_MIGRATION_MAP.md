# Direction Migration Map: 12 ? 8 Directions

## Overview
This document outlines the migration from 12 growth directions to 8 merged directions, maintaining backward compatibility for user data.

## Migration Summary

### Old 12 Directions ? New 8 Directions

| Old Direction | Old Slug | Action | New Direction | New Slug | Notes |
|--------------|----------|--------|---------------|----------|-------|
| Learning & Knowledge | `learning` | **KEEP** | Learning & Knowledge | `learning` | Merged with education & digital |
| Career & Projects | `career` | **KEEP** | Career & Projects | `career` | No change |
| Finance & Stability | `finance` | **KEEP** | Finance & Stability | `finance` | No change |
| Health & Fitness | `health` | **RENAME** | Health & Vitality | `health` | Renamed only |
| Relationships & Family | `relationships` | **KEEP** | Relationships & Family | `relationships` | No change |
| Community & Society | `community` | **KEEP** | Community & Society | `community` | No change |
| Creativity & Expression | `creativity` | **KEEP** | Creativity & Expression | `creativity` | No change |
| Mindfulness & Balance | `mindfulness` | **KEEP & MERGE** | Mindfulness & Inner Balance | `mindfulness` | Merged with personal, renamed |
| Personal Growth & Self-Awareness | `personal` | **MERGE INTO** | Mindfulness & Inner Balance | `mindfulness` | Merged into mindfulness |
| Digital Skills & Tech | `digital` | **MERGE INTO** | Learning & Knowledge | `learning` | Merged into learning |
| Education & Mentorship | `education` | **MERGE INTO** | Learning & Knowledge | `learning` | Merged into learning |
| Meaning & Purpose | `purpose` | **KEEP** | Meaning & Purpose | `purpose` | No change |

## Merged Directions Details

### 1. Learning & Knowledge (merged)
- **Old slugs merged**: `learning`, `education`, `digital`
- **New slug**: `learning`
- **New title**: "Learning & Knowledge"
- **Emoji**: ??
- **Description**: Covers education, mentorship, and tech skills
- **Type**: Primary

**Merged tasks from:**
- Learning: Read 10 pages, Watch educational videos, Make summaries, Complete courses, Earn certificates, Publish guides
- Education: Help someone learn, Share insights, Study pedagogy, Mentor students, Give talks, Publish guides
- Digital: Learn tools, Use AI daily, Security hygiene, Launch sites, Master technology, Create digital products

### 2. Mindfulness & Inner Balance (merged)
- **Old slugs merged**: `mindfulness`, `personal`
- **New slug**: `mindfulness`
- **New title**: "Mindfulness & Inner Balance"
- **Emoji**: ?????
- **Description**: Covers mindfulness practices and personal growth
- **Type**: Primary

**Merged tasks from:**
- Mindfulness: Meditate 5-10m, Micro-breaks, Stress checks, Retreats, Build habits, Quit bad habits
- Personal: Reflect in journal, Review goals, Seek feedback, Personality tests, Hit personal goals, Courageous steps

### 3. Health & Vitality (renamed)
- **Old slug**: `health`
- **New slug**: `health`
- **Old title**: "Health & Fitness"
- **New title**: "Health & Vitality"
- **Emoji**: ??
- **Description**: Health, fitness, and vitality practices
- **Type**: Primary

## Data Migration

### User Data Compatibility

All user data is automatically migrated:

1. **user_selected_directions**: Old direction IDs are mapped to new direction IDs
   - `education` ? `learning`
   - `digital` ? `learning`
   - `personal` ? `mindfulness`

2. **growth_tasks**: All tasks from merged directions are reassigned to new directions
   - Education tasks ? Learning
   - Digital tasks ? Learning
   - Personal tasks ? Mindfulness

3. **user_tasks**: Automatically migrated via task reassignment (no user action needed)

4. **sw_ledger**: SW points are preserved by mapping old direction IDs to new ones

5. **Duplicate removals**: If a user had both old and new directions selected, duplicates are removed

## Backward Compatibility

The frontend code includes legacy mappings for old slugs:
- `personal` ? `mindfulness` (emoji: ?????)
- `digital` ? `learning` (emoji: ??)
- `education` ? `learning` (emoji: ??)

This ensures that any cached references to old slugs will still work correctly.

## File Changes

### Database Migrations
- `123_merge_directions_12_to_8.sql`: Main migration script
- `124_seed_8_directions.sql`: Updated seed data with 8 directions

### Frontend Updates
- `app/(auth)/growth-directions/page.tsx`: Updated emoji map with legacy support
- `app/(auth)/growth/[slug]/page.tsx`: Updated emoji map
- `app/(auth)/growth/page.tsx`: Updated emoji map

### Badge System
- `supabase/migrations/112_badges_system.sql`: Updated badge description from "12 SW-directions" to "8 SW-directions"

## Final 8 Directions

1. **Learning & Knowledge** ?? (merged from learning, education, digital)
2. **Career & Projects** ??
3. **Finance & Stability** ??
4. **Health & Vitality** ?? (renamed from Health & Fitness)
5. **Relationships & Family** ??
6. **Community & Society** ??
7. **Creativity & Expression** ??
8. **Mindfulness & Inner Balance** ????? (merged from mindfulness, personal)
9. **Meaning & Purpose** ???

**Note**: There are actually 9 directions total, with "purpose" being the 9th. The consolidation reduced from 12 to 9, with 3 directions merged and 1 renamed.
