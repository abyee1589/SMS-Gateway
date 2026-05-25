'use client';
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = ScrollToTop;
const react_1 = require("react");
const navigation_1 = require("next/navigation");
function ScrollToTop() {
    const pathname = (0, navigation_1.usePathname)();
    (0, react_1.useEffect)(() => {
        window.scrollTo({
            top: 0,
            left: 0,
            behavior: 'auto',
        });
    }, [pathname]);
    return null;
}
//# sourceMappingURL=scroll-to-top.js.map