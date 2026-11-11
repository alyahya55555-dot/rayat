/* رايات — البوابة والتوجيه: #host لوحة المشرف، #display-1234 شاشة العرض، #join-1234 الجوال */
const Landing = { init() { $('#app').innerHTML = `<div class="landing"><div class="box"><h1 class="k">رايـــات</h1><div class="mut" style="font-size:20px;margin-top:8px">حرب السيطرة على الجزيرة · فريق بناء</div>
  <div class="roles"><button class="role" data-go="join"><span style="font-size:34px">📱</span><b>دخول المتسابق</b><span class="mut">من الجوال</span></button><button class="role" data-go="display"><span style="font-size:34px">🖥️</span><b>شاشة العرض</b><span class="mut">للبروجكتور</span></button><button class="role" data-go="host"><span style="font-size:34px">🎛️</span><b>لوحة المشرف</b><span class="mut">إنشاء المسابقة وإدارتها</span></button></div></div></div>`;
  const gd = document.createElement('button'); gd.className = 'btn guidebtn'; gd.textContent = '📖 دليل المسابقة'; gd.onclick = () => Manual.open('p'); $('.landing .box').appendChild(gd);
  $$('[data-go]').forEach(b => b.onclick = () => { SFX.unlock(); location.hash = b.dataset.go === 'join' ? 'join' : b.dataset.go; route(); }); } };
function route() { const h = (location.hash || '').replace('#', '');
  if (h === 'guide') return Manual.page();
  if (h === 'host') return Host.init();
  if (h.startsWith('display')) return Display.init((h.split('-')[1] || '').replace(/\D/g, '').slice(0, 4));
  if (h.startsWith('join') || h === 'play') { const p = h.split('-'); return Phone.init((p[1] || '').replace(/\D/g, '').slice(0, 4) || null, /^[0-9a-f]{12}$/.test(p[2] || '') ? p[2] : null); }
  return Landing.init(); }
document.fonts && document.fonts.ready.then(() => { });
route();
