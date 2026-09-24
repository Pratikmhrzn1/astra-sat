/**
 * The design-system primitives and class recipes, re-exported so a component
 * imports one module ('@/components/common') instead of one per element.
 * Anything here is presentational and knows nothing about features, routing
 * or data fetching.
 */
export {
  Control, controlStyle, iconControlStyle, accentControlStyle, type ControlVariant, type ControlSize,
} from './Button';
export {
  Panel, PanelMasthead, PanelBody, PanelTitle, surfaceStyle, panelStyle, kickerStyle, screenStyle, tableHeadStyle, tableRowStyle,
} from './Card';
export { Tag, SubjectTag, RoleTag } from './Badge';
export { ScreenMasthead, pillStyle, chipStyle } from './PageHeader';
export { BlankStatus, IconBlank, NotePanel, ErrorNotice } from './States';
export { Field, TextField, Chooser } from './Input';
export {
  fieldStyle, fieldInputStyle, fieldCaptionStyle, errorTextStyle, hintTextStyle, alertStyle,
  segmentClusterClass, segmentStyle,
} from './formStyles';
export { Dialog, AcknowledgeDialog } from './Modal';
export { Tray } from './Sheet';
export { Switch } from './Toggle';
export { Loader, ScreenLoader, InlineSpinner } from './Spinner';
export { SeriesGraph, SERIES_HUES, type SeriesSeries } from './TrendChart';
export { AccuracyColumns, type AccuracyLine } from './AccuracyBars';
export { RadarGraph, type RadarSpoke } from './RadarChart';
export { PieGraph, type PieWedge } from './PieChart';
