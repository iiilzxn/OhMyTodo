import React from "react";
import ReactDOM from "react-dom/client";
import { Provider } from "./state";
import { App } from "./App";
import "./styles.css";
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Provider>
      <App />
    </Provider>
  </React.StrictMode>,
);
