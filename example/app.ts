import path from "node:path";
import express from "express";
import { createViewEngine } from "../src/express.ts";

const app = express();
const viewsDir = path.resolve(import.meta.dirname, "views");

app.engine(
  "tml",
  createViewEngine({
    viewsDir,
    cache: false,
  }),
);

app.set("view engine", "tml");
app.set("views", viewsDir);

app.get("/", (_req, res) => {
  res.render("pages/home", {
    title: "TML Engine",
    user: { name: "Ali", role: "admin" },
    features: [
      {
        name: "Component Sistemi",
        description: "Her sey bir component. Layout bile.",
        isNew: false,
      },
      {
        name: "Children",
        description: "React benzeri children ile ic ice component'ler.",
        isNew: true,
      },
      {
        name: "Context API",
        description: "@provide ile prop drilling olmadan veri paylasimi.",
        isNew: true,
      },
      {
        name: "CSS/JS Toplama",
        description: "Sadece kullanilan component'lerin asset'leri toplanir.",
        isNew: false,
      },
    ],
    xssTest: '<script>alert("XSS")</script>',
    safeHtml: '<em>Bu guvenli HTML</em>',
  });
});

app.get("/about", (_req, res) => {
  res.render("pages/about", {
    title: "Hakkinda",
    team: [
      { name: "Ahmet", role: "Frontend Gelistirici" },
      { name: "Ayse", role: "Backend Gelistirici" },
      { name: "Mehmet", role: "DevOps Muhendisi" },
    ],
  });
});

const port = 3456;
app.listen(port, () => {
  console.log(`TML Demo running at http://localhost:${port}`);
});
