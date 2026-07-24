import { Router, Request, Response } from "express";

import widgetOverviewHTML from "file://widgets/overview.html?base64&minify";
import widget1HTML from "file://widgets/widget1.html?base64&minify";
import widget2HTML from "file://widgets/widget2.html?base64&minify";
import widget3HTML from "file://widgets/widget3.html?base64&minify";
import widget4HTML from "file://widgets/widget4.html?base64&minify";
import widget5HTML from "file://widgets/widget5.html?base64&minify";

const convertedWidgetOverviewHTML = Buffer.from(
  widgetOverviewHTML,
  "base64",
).toString("utf-8");

const convertedWidget1HTML = Buffer.from(widget1HTML, "base64").toString(
  "utf-8",
);

const convertedWidget2HTML = Buffer.from(widget2HTML, "base64").toString(
  "utf-8",
);

const convertedWidget3HTML = Buffer.from(widget3HTML, "base64").toString(
  "utf-8",
);

const convertedWidget4HTML = Buffer.from(widget4HTML, "base64").toString(
  "utf-8",
);

const convertedWidget5HTML = Buffer.from(widget5HTML, "base64").toString(
  "utf-8",
);

export default async function serveWidgets(router: Router) {
  router.get("/overview", (req: Request, res: Response) => {
    res.setHeader("Content-Type", "text/html");
    res.send(convertedWidgetOverviewHTML);
  });

  router.get("/widget1", (req: Request, res: Response) => {
    res.setHeader("Content-Type", "text/html");
    res.send(convertedWidget1HTML);
  });

  router.get("/widget2", (req: Request, res: Response) => {
    res.setHeader("Content-Type", "text/html");
    res.send(convertedWidget2HTML);
  });

  router.get("/widget3", (req: Request, res: Response) => {
    res.setHeader("Content-Type", "text/html");
    res.send(convertedWidget3HTML);
  });

  router.get("/widget4", (req: Request, res: Response) => {
    res.setHeader("Content-Type", "text/html");
    res.send(convertedWidget4HTML);
  });

  router.get("/widget5", (req: Request, res: Response) => {
    res.setHeader("Content-Type", "text/html");
    res.send(convertedWidget5HTML);
  });
}
