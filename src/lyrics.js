// 桌面歌词窗口：接收主窗口发来的当前歌词，按进度做卡拉 OK 填色
import { listen, emit } from '@tauri-apps/api/event';

const line = document.getElementById('line');
const sub = document.getElementById('sub');
let lastText = '';

listen('lyric', ({ payload: d }) => {
  if (d.hue != null) document.documentElement.style.setProperty('--h', d.hue);
  if (d.size) document.documentElement.style.setProperty('--size', d.size + 'px');
  if (d.locked != null) document.body.classList.toggle('locked', d.locked);
  if (d.playing != null) document.getElementById('pp').setAttribute('d', d.playing ? 'M6.5 5h4v14h-4zm7 0h4v14h-4z' : 'M8 5.5v13l11-6.5z');
  if (d.text != null && d.text !== lastText) {
    lastText = d.text;
    line.textContent = d.text || '♪';
    line.classList.remove('swap'); void line.offsetWidth; line.classList.add('swap');
  }
  if (d.sub != null || d.next != null) sub.textContent = d.sub || d.next || '';
  if (d.progress != null) line.style.setProperty('--p', (d.progress * 100).toFixed(1) + '%');
});

document.querySelector('.bar').addEventListener('click', e => {
  const b = e.target.closest('[data-c]');
  if (b) emit('lyric-control', b.dataset.c);
});
emit('lyric-control', 'ready');
