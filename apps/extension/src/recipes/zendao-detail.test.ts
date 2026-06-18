import { describe, expect, it } from "vitest"
import { extractZentaoBugDetailPageCapture, isZentaoBugDetailUrl } from "./zendao-detail"

describe("zentao-detail", () => {
  it("recognizes both legacy and query-string bug detail URLs", () => {
    expect(isZentaoBugDetailUrl("https://zentao.local/bug-view-123.html")).toBe(true)
    expect(isZentaoBugDetailUrl("https://zentao.example.com/index.php?m=bug&f=view&bugID=10765")).toBe(true)
    expect(isZentaoBugDetailUrl("https://zentao.example.com/index.php?m=bug&f=view&id=10841")).toBe(true)
    expect(isZentaoBugDetailUrl("https://zentao.local/index.php?m=product&f=view&id=1")).toBe(false)

    // Supports embedded base64 open routing parameter
    const encodedOpen = encodeURIComponent(btoa("/index.php?m=bug&f=view&bugID=10765"))
    expect(isZentaoBugDetailUrl(`https://cd.shushangyun.com/index.php?m=index&f=index&open=${encodedOpen}`)).toBe(true)
  })

  it("extracts focused bug detail content and history comments", async () => {
    const html = `
      <body>
        <nav>
          <a href="/index.php?m=my&f=index">地盘</a>
          <img src="/static/svg/chat.svg" alt="" />
        </nav>
        <div id="mainContent">
          <div class="detail-view col relative gap-2.5" data-id="10765" data-type="bug">
            <div class="detail-header row gap-2 items-center flex-none">
              <button class="toolbar">返回</button>
              <div class="entity-title row items-center gap-2 min-w-0">
                <span class="label label-id">10765</span>
                <span class="entity-title-text text-lg text-clip font-bold" title="【uat】采购商-交易-寻源-待报价寻源需求单-查看报价，待报价寻源需求单详情页部分字段未做翻译">
                  【uat】采购商-交易-寻源-待报价寻源需求单-查看报价，待报价寻源需求单详情页部分字段未做翻译
                </span>
              </div>
            </div>
            <div class="detail-body row gap-2 items-start">
              <div class="detail-main flex-auto col gap-2 min-w-0">
                <div class="detail-sections canvas shadow rounded px-6 py-4" zui-key="main">
                  <div class="detail-section" zui-key="重现步骤">
                    <div class="detail-section-title row items-center gap-2">
                      <span class="text-md py-1 font-bold">重现步骤</span>
                    </div>
                    <div class="detail-section-content py-1">
                      <div class="article">
                        <p>[步骤]</p>
                        <p>步骤1，供应商报价</p>
                        <p>步骤2，查看页面翻译</p>
                        <p>[结果]</p>
                        <p>部分字段没有翻译</p>
                        <p><a href="/index.php?m=file&f=read&t=png&fileID=21648"><img src="/index.php?m=file&f=read&t=png&fileID=21648" alt="index.php?m=file&f=read&t=png&fileID=21648" /></a></p>
                        <p>[期望]</p>
                        <p>翻译成对应语言</p>
                      </div>
                    </div>
                  </div>
                </div>
                <div class="detail-sections canvas shadow rounded" zui-key="historyWrapper">
                  <div
                    zui-create-historypanel="{&quot;objectID&quot;:10765,&quot;objectType&quot;:&quot;bug&quot;,&quot;actions&quot;:[{&quot;id&quot;:&quot;231357&quot;,&quot;action&quot;:&quot;assigned&quot;,&quot;hasRendered&quot;:true,&quot;content&quot;:&quot;2026-06-10 16:45:59, 由 &lt;strong&gt;张三&lt;\/strong&gt; 指派给 &lt;strong&gt;李四&lt;\/strong&gt;。\n&quot;,&quot;comment&quot;:&quot;&lt;p&gt;&lt;span&gt;交易说明应该是用户填写的内容，不应该国际化，商品信息、角色需要国际化&lt;\/span&gt;&lt;\/p&gt;&quot;},{&quot;id&quot;:&quot;231361&quot;,&quot;action&quot;:&quot;assigned&quot;,&quot;hasRendered&quot;:true,&quot;content&quot;:&quot;2026-06-10 16:48:00, 由 &lt;strong&gt;李四&lt;\/strong&gt; 指派给 &lt;strong&gt;王五&lt;\/strong&gt;。\n&quot;,&quot;comment&quot;:&quot;&lt;p&gt;&lt;span&gt;麻烦确认下修改方案&lt;\/span&gt;&lt;\/p&gt;&quot;},{&quot;id&quot;:&quot;231400&quot;,&quot;action&quot;:&quot;assigned&quot;,&quot;hasRendered&quot;:true,&quot;content&quot;:&quot;2026-06-10 17:22:57, 由 &lt;strong&gt;王五&lt;\/strong&gt; 指派给 &lt;strong&gt;李四&lt;\/strong&gt;。\n&quot;,&quot;comment&quot;:&quot;&lt;p&gt;&lt;span&gt;交易说明填写信息无需国际化，商品信息、角色需要国际化&lt;\/span&gt;&lt;\/p&gt;&quot;}]}"
                  ></div>
                </div>
              </div>
              <aside class="detail-side side-col">
                <div><span>Bug状态</span><span class="status">激活</span></div>
                <div><span>指派给</span><span class="assignedTo">张三</span></div>
              </aside>
            </div>
          </div>
        </div>
      </body>
    `

    const result = await extractZentaoBugDetailPageCapture({
      url: "https://zentao.example.com/index.php?m=bug&f=view&bugID=10765",
      html,
      title: "BUG #10765"
    })

    expect(result?.metadata.pageKind).toBe("zentao-bug-detail")
    expect(result?.metadata.bugId).toBe("10765")
    expect(result?.metadata.title).toBe("【uat】采购商-交易-寻源-待报价寻源需求单-查看报价，待报价寻源需求单详情页部分字段未做翻译")
    expect(result?.metadata.status).toBe("激活")
    expect(result?.metadata.assignedTo).toBe("张三")
    expect(result?.markdown).toContain("重现步骤")
    expect(result?.markdown).toContain("翻译成对应语言")
    expect(result?.markdown).toContain("历史记录")
    expect(result?.markdown).toContain("交易说明应该是用户填写的内容")
    expect(result?.markdown).toContain("麻烦确认下修改方案")
    expect(result?.markdown).toContain("交易说明填写信息无需国际化")
    expect(result?.markdown).not.toContain("地盘")
    expect(result?.markdown).not.toContain("返回")
    expect(result?.images[0]?.sourceUrl).toBe("https://zentao.example.com/index.php?m=file&f=read&t=png&fileID=21648")
  })

  it("extracts already rendered native HTML history elements and formats them", async () => {
    const html = `
      <body>
        <div id="mainContent">
          <div class="detail-view">
            <div class="entity-title"><span class="entity-title-text">BUG #12345 页面死锁</span></div>
            <div class="detail-main">
              <div class="detail-sections" zui-key="main">
                <div class="detail-section" zui-key="重现步骤">
                  <div class="detail-section-title">重现步骤</div>
                  <div class="detail-section-content">步骤1...</div>
                </div>
              </div>
              <div class="detail-sections" zui-key="historyWrapper">
                <ol class="history-list">
                  <li class="history-item">
                    <span class="time">2026-06-15 10:00:00</span> 由 <strong>用户A</strong> 创建。
                  </li>
                  <li class="history-item">
                    <span class="time">2026-06-15 10:05:00</span> 由 <strong>用户B</strong> 备注。
                    <div class="comment">
                      下面是错误的curl:
                      <pre><code>curl -X POST https://api.local</code></pre>
                    </div>
                  </li>
                </ol>
              </div>
            </div>
          </div>
        </div>
      </body>
    `

    const result = await extractZentaoBugDetailPageCapture({
      url: "https://zentao.example.com/index.php?m=bug&f=view&bugID=12345",
      html,
      title: "BUG #12345"
    })

    expect(result?.markdown).toContain("历史记录")
    expect(result?.markdown).toContain("2026-06-15 10:00:00")
    expect(result?.markdown).toContain("2026-06-15 10:05:00")
    expect(result?.markdown).toContain("curl -X POST https://api.local")
  })
})
