export interface SegmentedOption<V extends string | number> {
  value: V;
  label: string;
  title?: string;
  disabled?: boolean;
}
