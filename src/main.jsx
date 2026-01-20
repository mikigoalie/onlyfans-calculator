import { createRoot } from "react-dom/client";
import "@mantine/core/styles.css";
import "@mantine/notifications/styles.css";
import { MantineProvider } from "@mantine/core";
import { Notifications } from "@mantine/notifications";

import App from "./App.jsx";

createRoot(document.getElementById("root")).render(
  <MantineProvider defaultColorScheme="dark">
    <Notifications />
    <App />
  </MantineProvider>,
);
