import { View, div } from "gpui-kit";
import { checking, focused } from "herdr";
import { oneShot } from "./modkit.js";
import { closeCurrent } from "./close.js";

export default class CloseTab extends View {
  init(_props, cx) {
    if (checking()) return;
    const f = focused();
    oneShot(cx, () => closeCurrent(f?.space, f?.tab), "gitview-close-tab");
  }
  render() { return div(); }
}
