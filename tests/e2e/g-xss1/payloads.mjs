/** Sentinel's 32-payload set (review section 2 and the #99 32-payload description)
 *  plus the mutation-XSS cases exercised in kil-xss-profile.test.mjs. */
export const PAYLOADS = [
  { id: 'p01', group: 'basic', body: '<img src=x onerror=alert(1)>' },
  { id: 'p02', group: 'basic', body: '<script>alert(1)</script>' },
  { id: 'p03', group: 'basic', body: '<a href="javascript:alert(1)">j</a>' },
  { id: 'p04', group: 'basic', body: '<svg onload=alert(1)></svg>' },
  { id: 'p05', group: 'svg-style', body: '<svg><style><img src=x onerror=alert(1)></style></svg>' },
  { id: 'p06', group: 'math-mglyph', body: '<math><mtext><table><mglyph><style><!--</style><img title="--&gt;&lt;/mglyph&gt;&lt;img src=1 onerror=alert(1)&gt;">' },
  { id: 'p07', group: 'form-math', body: '<form><math><mtext></form><form><mglyph><svg><mtext><style><path id="</style><img onerror=alert(1) src>">' },
  { id: 'p08', group: 'noscript', body: '<noscript><p title="</noscript><img src=x onerror=alert(1)>">' },
  { id: 'p09', group: 'textarea', body: '<textarea><img src=x onerror=alert(1)></textarea>' },
  { id: 'p10', group: 'xmp', body: '<xmp><img src=x onerror=alert(1)></xmp>' },
  { id: 'p11', group: 'entity-javascript', body: '<a href="&#106;avascript:alert(1)">j</a>' },
  { id: 'p12', group: 'entity-tab', body: '<a href="java&#9;script:alert(1)">j</a>' },
  { id: 'p13', group: 'whitespace-javascript', body: '<a href=" javascript:alert(1)">j</a>' },
  { id: 'p14', group: 'tab-javascript', body: '<a href="java\tscript:alert(1)">j</a>' },
  { id: 'p15', group: 'data', body: '<img src="data:text/html,<script>alert(1)</script>">' },
  { id: 'p16', group: 'vbscript', body: '<a href="vbscript:alert(1)">j</a>' },
  { id: 'p17', group: 'srcset', body: '<img src="https://keepitil.com/icon-192.png" srcset="javascript:alert(1)" onerror=alert(1)>' },
  { id: 'p18', group: 'poster', body: '<video poster="javascript:alert(1)" onerror=alert(1)></video>' },
  { id: 'p19', group: 'xlink', body: '<svg><a xlink:href="javascript:alert(1)"><text>j</text></a></svg>' },
  { id: 'p20', group: 'clobber', body: '<img id="KilSafeHtml" name="sanitize" src=x onerror=alert(1)>' },
  { id: 'p21', group: 'base', body: '<base href="https://evil.example/">' },
  { id: 'p22', group: 'meta-refresh', body: '<meta http-equiv="refresh" content="0;url=javascript:alert(1)">' },
  { id: 'p23', group: 'iframe', body: '<iframe src="javascript:alert(1)"></iframe>' },
  { id: 'p24', group: 'object', body: '<object data="javascript:alert(1)"></object>' },
  { id: 'p25', group: 'embed', body: '<embed src="javascript:alert(1)">' },
  { id: 'p26', group: 'template', body: '<template><img src=x onerror=alert(1)></template>' },
  { id: 'p27', group: 'formaction', body: '<button formaction="javascript:alert(1)">go</button>' },
  { id: 'p28', group: 'style-url', body: '<div style="background:url(javascript:alert(1))">x</div>' },
  { id: 'p29', group: 'link', body: '<link rel="stylesheet" href="javascript:alert(1)">' },
  { id: 'p30', group: 'autofocus', body: '<input autofocus onfocus=alert(1)>' },
  { id: 'p31', group: 'ontoggle', body: '<details open ontoggle=alert(1)><summary>x</summary></details>' },
  { id: 'p32', group: 'comment', body: '<!--<script>alert(1)</script>--><img src=x onerror=alert(1)>' }
];

export const MUTATIONS = [
  { id: 'm01', group: 'mutation', body: '<svg><style><img src=x onerror=alert(1)></style></svg>' },
  { id: 'm02', group: 'mutation', body: '<math><style><img src=x onerror=alert(1)></style></math>' },
  { id: 'm03', group: 'mutation', body: '<math><mtext><table><mglyph><style><!--</style><img title="--&gt;&lt;/mglyph&gt;&lt;img src=1 onerror=alert(1)&gt;">' },
  { id: 'm04', group: 'mutation', body: '<form><math><mtext></form><form><mglyph><svg><mtext><style><path id="</style><img onerror=alert(1) src>">' },
  { id: 'm05', group: 'mutation', body: '<noscript><style></noscript><img src=x onerror=alert(1)>' },
  { id: 'm06', group: 'mutation', body: '<noscript><p title="</noscript><img src=x onerror=alert(1)>">' },
  { id: 'm07', group: 'mutation', body: '<textarea><script>alert(1)</script></textarea>' },
  { id: 'm08', group: 'mutation', body: '<xmp><img src=x onerror=alert(1)></xmp>' },
  { id: 'm09', group: 'mutation', body: '<svg><desc><![CDATA[</desc><img src=x onerror=alert(1)>]]></svg>' }
];

export const URL_CASES = [
  { id: 'url-javascript', group: 'article-url', body: 'javascript:alert(1)' },
  { id: 'url-http', group: 'article-url', body: 'http://evil.example/phish' }
];

export const ALL = PAYLOADS.concat(MUTATIONS);
