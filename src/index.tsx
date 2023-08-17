import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
// import Mailbox from "./Mailbox";

const root = ReactDOM.createRoot(
    document.getElementById("root") as HTMLElement
);
root.render(<App />); //document.location.pathname === "/" ? <App /> : <Mailbox />);
