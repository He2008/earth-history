// 生成的文件,勿手改 — npm run tokens(源:design/tokens/map.json)
// maplibre paint 属性不解析 CSS 变量,globe 需要这里的字面量。
export const MAP = {
  territory: {
  default: "#B9A47B",
  friendly: "#78916B",
  allied: "#7698B5",
  neutral: "#C8BA9A",
  rival: "#A85B50",
  occupied: "#8E6655",
  unexplored: "#D8D0BF",
  "selected-outline": "#C6A15B",
  border: "#F0E5CC"
},
  route: {
  trade: "#C6A15B",
  diplomatic: "#7698B5",
  military: "#A85B50"
},
  label: {
  primary: "#382C22",
  secondary: "#786A55",
  inverse: "#FBF6EB"
},
  overlay: {
  hover: "#C6A15B40",
  selection: "#C6A15B66"
},
} as const;

export const GLOBE = {
  space: "#121B23",
  marker: "#C6A15B",
} as const;
