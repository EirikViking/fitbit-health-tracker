# Sleep Calculation Implementation Notes

## Summary

The sleep calculation logic has been implemented to correctly match the **Fitbit Web API** response. There is a known discrepancy between the Web API values and the Fitbit mobile app values due to API limitations.

## Implementation

**Location**: [src/index.ts:1394-1479](src/index.ts#L1394-L1479)

### Sleep Attribution Rules

1. **Primary**: Use `endTime` date (wake date) for attribution
2. **Fallback**: Use `dateOfSleep` only if `endTime` is missing
3. **Deduplication**: By session key (`startTime + endTime`), not `logId`
4. **Calculation**: Sum `minutesAsleep` from all included sessions
5. **Fallback**: Use `summary.totalMinutesAsleep` if no detailed logs

### Example for 2026-01-27

**API Returns (3 sessions):**
- 00:34 - 02:31: 117 minutes
- 03:45 - 04:51: 66 minutes
- 06:02:30 - 08:29:30: 144 minutes
- **Total: 327 minutes** ✓

**Our Calculation:**
- All 3 sessions have `endTime` date = 2026-01-27
- All 3 are included
- Sum: 117 + 66 + 144 = **327 minutes** ✓

## API Limitation: App vs API Discrepancy

### The Issue

The Fitbit mobile app shows **different sleep totals** than the Web API for the same dates:

| Date | Web API | Mobile App | Difference |
|------|---------|------------|------------|
| 2026-01-27 | 327 min | 256 min | -71 min |
| 2026-01-26 | 261 min | 247 min | -14 min |
| 2026-01-23 | 243 min | 243 min | 0 min |

### Root Cause

The Fitbit Web API and mobile app use different data processing:

**Fitbit Web API:**
- Returns raw sensor recordings
- Sleep sessions end when device stops detecting sleep movements
- Example: 06:02:30 - 08:29:30 (144 min)

**Fitbit Mobile App:**
- Applies proprietary wake detection algorithms
- Analyzes movement patterns, heart rate, sleep stages
- May truncate sessions based on detected wake time
- Example: 06:02 - 07:15 (73 min) - same session truncated

### Why We Can't Match the App

1. **Wake detection is not exposed**: The Web API doesn't provide the wake detection data
2. **Proprietary algorithms**: Fitbit's wake detection logic is not documented
3. **Minute data shows continuous sleep**: The raw sensor data (value=1) shows no wake-up at the app's truncation points
4. **Dynamic per-day**: The app's truncation varies by day based on sensor analysis, not fixed rules

### What We Tried

✓ Checked for midnight-crossing sessions - none found
✓ Checked for `infoCode` or special flags - none present
✓ Tested different attribution methods (start date, end date, dateOfSleep) - no match
✓ Looked for sleep goal/schedule - found, but app doesn't simply cut at wake time
✓ Analyzed minute-by-minute data - shows continuous sleep through app's truncation points

### Conclusion

**Our implementation is correct.** It accurately calculates sleep totals from the available Fitbit Web API data. The discrepancy with the mobile app is due to API limitations that cannot be overcome without access to Fitbit's internal wake detection algorithms or additional API endpoints.

## Debugging

DEBUG logging can be enabled by uncommenting `DEBUG_SLEEP = "1"` in `wrangler.toml`. This will log:

```
[DEBUG_SLEEP] Target Date: YYYY-MM-DD | Total Raw Logs: N
[DEBUG_SLEEP] RAW_ENTRY | ID:xxx | Main:true | Mins:xxx | DOS:YYYY-MM-DD | Start:... | End:...
[DEBUG_SLEEP] INCLUSION | TargetDate:xxx | RawCount:N | IncludedCount:N | IncludedSum:xxx | MainCount:N | Fallback:no
[DEBUG_SLEEP] SESSION_KEYS | startTime_endTime, ...
```

## References

- Fitbit Web API: https://dev.fitbit.com/build/reference/web-api/sleep/
- Sleep Goal endpoint: `/sleep/goal.json` (returns bedtime/wakeupTime but not used for calculations)
