// 广西固废新闻引擎的外部声明：本模块没有自己的公开页面与 HTTP 路由，只挂 worker 的
// 定时巡检与平台推送（见 server.ts），所以三份清单里只占 server 一份。
import { defineModule } from "@aihot/contracts/modules";

export const newsPatrolModule = defineModule({ name: "news-patrol" });
