import * as React from "react";
import * as ReactDOM from "react-dom";
import { Provider } from "react-redux";
import { getKernelStore } from "./store";
import App from "./components/App";

ReactDOM.render(
  <React.StrictMode>
    <Provider store={getKernelStore()}>
      <App />
    </Provider>
  </React.StrictMode>,
  document.getElementById("root")
);