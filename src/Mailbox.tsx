import React from "react";

// import React, { useCallback, useEffect, useMemo, useState } from "react";
// import { GenericSortedMergedList, MessagesList } from "@ylide/sdk";
// import "./Mailbox.scss";

// import { CSSTransition, TransitionGroup } from "react-transition-group";
// import cn from "classnames";

// const timelineA = [...new Array(100)]
//     .map((e) => Math.floor(Math.random() * 1000000))
//     .sort();
// const timelineB = [...new Array(100)]
//     .map((e) => Math.floor(Math.random() * 1000000))
//     .sort();

// const aCallbacksMessages = [];
// const aCallbacksMessage = [];
// const bCallbacksMessages = [];
// const bCallbacksMessage = [];

// const sourceA: GenericSortedSource<null> = {
//     getAfter: async (entry, limit) =>
//         timelineA
//             .filter((e) => e < entry.time)
//             .map((t) => ({ link: null, time: t })),
//     getBefore: async (entry, limit) =>
//         timelineA
//             .filter((e) => e > entry.time)
//             .map((t) => ({ link: null, time: t })),
//     getLast: async (limit: number) =>
//         timelineA
//             .slice(timelineA.length - limit)
//             .map((t) => ({ link: null, time: t })),

//     on: (event: "messages" | "message", callback) =>
//         event === "messages"
//             ? aCallbacksMessages.push(callback)
//             : aCallbacksMessage.push(callback),
//     off: (event: "messages" | "message", callback) => null,
// };

// const sourceB: GenericSortedSource<null> = {
//     getAfter: async (entry, limit) =>
//         timelineB
//             .filter((e) => e < entry.time)
//             .map((t) => ({ link: null, time: t })),
//     getBefore: async (entry, limit) =>
//         timelineB
//             .filter((e) => e > entry.time)
//             .map((t) => ({ link: null, time: t })),
//     getLast: async (limit: number) =>
//         timelineB
//             .slice(timelineB.length - limit)
//             .map((t) => ({ link: null, time: t })),

//     on: (event: "messages" | "message", callback) =>
//         event === "messages"
//             ? bCallbacksMessages.push(callback)
//             : bCallbacksMessage.push(callback),
//     off: (event: "messages" | "message", callback) => null,
// };

// const instance = new GenericSortedMergedList<null>();
// instance.addSource(sourceA);
// instance.addSource(sourceB);

// // @ts-ignore
// window.inst = instance;

// export function Mailbox() {
//     const [wnd, setWnd] = useState<{ link: null; time: number }[]>([]);

//     useEffect(() => {
//         instance.on("windowUpdate", () => {
//             setWnd(instance.getWindow());
//         });

//         instance.readFirstPage();
//     }, []);

//     return (
//         <div
//             style={{
//                 width: "100vw",
//                 height: "100vh",
//                 display: "flex",
//                 alignItems: "center",
//                 justifyContent: "center",
//             }}
//         >
//             <div
//                 style={{
//                     display: "flex",
//                     flexDirection: "column",
//                     alignItems: "stretch",
//                     justifyContent: "flex-start",
//                     width: "500px",
//                     height: "600px",
//                     border: "1px solid #e0e0e0",
//                 }}
//             >
//                 {/* <button onClick={addFirst}>Add first</button>
//                 <button onClick={add}>Add</button>
//                 <button onClick={remove}>Remove</button> */}
//                 <div className="mailbox">
//                     <TransitionGroup className="todo-list">
//                         {wnd.map((m) => (
//                             <CSSTransition
//                                 key={m.time}
//                                 timeout={300}
//                                 classNames="mailbox-item"
//                             >
//                                 <div className="mailbox-item" key={m.time}>
//                                     {m.time}
//                                 </div>
//                             </CSSTransition>
//                         ))}
//                     </TransitionGroup>
//                 </div>
//             </div>
//         </div>
//     );
// }

// export default Mailbox;
