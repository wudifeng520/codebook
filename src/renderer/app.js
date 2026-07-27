'use strict';

const $ = (id) => document.getElementById(id);
const TOUCH_THROTTLE_MS = 30_000;
const state = { creating: false, entries: [], folders: [], filter: 'all', query: '' };
let toastTimer;
let lastTouch = 0;

function toast(message) {
  $('toast').textContent = message;
  $('toast').classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $('toast').classList.remove('show'), 2200);
}

function setBusy(button, busy, label) {
  button.disabled = busy;
  if (busy) { button.dataset.label = button.textContent; button.textContent = label; }
  else if (button.dataset.label) button.textContent = button.dataset.label;
}

async function initialize() {
  const status = await window.vaultApi.status();
  const appMeta = `v${status.version} · 作者 ${status.author}`;
  $('appMeta').textContent = appMeta;
  $('authAppMeta').textContent = appMeta;
  state.creating = !status.exists;
  $('authSubtitle').textContent = state.creating ? '创建一个只属于你的加密保险库' : '你的密码，只属于这台电脑';
  $('authSubmit').textContent = state.creating ? '创建保险库' : '解锁保险库';
  $('confirmGroup').classList.toggle('hidden', !state.creating);
  $('authHint').classList.toggle('hidden', !state.creating);
  $('confirmPassword').required = state.creating;
  $('masterPassword').focus();
}

async function submitAuth(event) {
  event.preventDefault();
  const password = $('masterPassword').value;
  $('authError').textContent = '';
  if (password.length < 8) { $('authError').textContent = '主密码至少需要 8 个字符'; return; }
  if (state.creating && password !== $('confirmPassword').value) { $('authError').textContent = '两次输入的主密码不一致'; return; }
  setBusy($('authSubmit'), true, state.creating ? '正在创建…' : '正在解锁…');
  try {
    if (state.creating) await window.vaultApi.create(password);
    else await window.vaultApi.unlock(password);
    $('masterPassword').value = '';
    $('confirmPassword').value = '';
    await showApp();
  } catch (error) {
    $('authError').textContent = error.message;
    $('masterPassword').select();
  } finally { setBusy($('authSubmit'), false); }
}

async function showApp() {
  $('authView').classList.add('hidden');
  $('appView').classList.remove('hidden');
  await refreshVault();
}

async function lock() {
  closeEditor();
  await window.vaultApi.lock();
  showLockScreen();
}

function showLockScreen() {
  $('appView').classList.add('hidden');
  $('authView').classList.remove('hidden');
  $('masterPassword').value = '';
  $('authError').textContent = '';
  state.creating = false;
  $('authSubtitle').textContent = '保险库已锁定，请输入主密码';
  $('authSubmit').textContent = '解锁保险库';
  $('confirmGroup').classList.add('hidden');
  $('authHint').classList.add('hidden');
  $('confirmPassword').required = false;
  $('masterPassword').focus();
}

async function refreshVault() {
  [state.entries, state.folders] = await Promise.all([
    window.vaultApi.list(),
    window.vaultApi.listFolders()
  ]);
  renderFolders();
  renderFolderOptions();
  renderEntries();
}

function filteredEntries() {
  const query = state.query.toLocaleLowerCase('zh-CN');
  return state.entries
    .filter((entry) => {
      if (state.filter === 'favorite') return entry.favorite;
      if (state.filter === 'unfiled') return !entry.folderId;
      if (state.filter.startsWith('folder:')) return entry.folderId === state.filter.slice(7);
      return true;
    })
    .filter((entry) => !query || [entry.title, entry.username, entry.website].some((value) => String(value || '').toLocaleLowerCase('zh-CN').includes(query)))
    .sort((a, b) => Number(b.favorite) - Number(a.favorite) || a.title.localeCompare(b.title, 'zh-CN'));
}

function folderById(id) {
  return state.folders.find((folder) => folder.id === id);
}

function renderFolders() {
  const list = $('folderList');
  list.replaceChildren();
  list.append(createFolderRow({ id: '', name: '未分类' }, state.entries.filter((entry) => !entry.folderId).length, false));
  for (const folder of state.folders) {
    list.append(createFolderRow(folder, state.entries.filter((entry) => entry.folderId === folder.id).length, true));
  }
}

function createFolderRow(folder, count, editable) {
  const filter = folder.id ? `folder:${folder.id}` : 'unfiled';
  const row = document.createElement('div');
  row.className = `folder-row${state.filter === filter ? ' active' : ''}`;
  row.dataset.filter = filter;
  const select = document.createElement('button');
  select.type = 'button';
  select.className = 'folder-select-btn';
  const icon = document.createElement('span'); icon.textContent = '▰';
  const name = document.createElement('b'); name.textContent = folder.name;
  const amount = document.createElement('em'); amount.textContent = count;
  select.append(icon, name, amount);
  select.addEventListener('click', () => selectFilter(filter));
  row.append(select);
  if (editable) {
    const edit = document.createElement('button');
    edit.type = 'button'; edit.className = 'folder-edit-btn'; edit.textContent = '•••'; edit.title = '管理文件夹';
    edit.addEventListener('click', () => openFolderEditor(folder.id));
    row.append(edit);
  }
  return row;
}

function renderFolderOptions() {
  const select = $('folderId');
  const selected = select.value;
  select.replaceChildren(new Option('未分类', ''));
  for (const folder of state.folders) select.add(new Option(folder.name, folder.id));
  if ([...select.options].some((option) => option.value === selected)) select.value = selected;
}

function selectFilter(filter) {
  state.filter = filter;
  document.querySelectorAll('[data-filter]').forEach((item) => item.classList.toggle('active', item.dataset.filter === filter));
  if (filter === 'favorite') $('viewTitle').textContent = '收藏';
  else if (filter === 'unfiled') $('viewTitle').textContent = '未分类';
  else if (filter.startsWith('folder:')) $('viewTitle').textContent = folderById(filter.slice(7))?.name || '文件夹';
  else $('viewTitle').textContent = '全部项目';
  renderEntries();
}

function renderEntries() {
  $('allCount').textContent = state.entries.length;
  $('favoriteCount').textContent = state.entries.filter((e) => e.favorite).length;
  const entries = filteredEntries();
  const list = $('entryList');
  list.replaceChildren();
  $('emptyState').classList.toggle('hidden', entries.length > 0 || Boolean(state.query));
  if (!entries.length && state.query) {
    const message = document.createElement('div');
    message.className = 'empty-state';
    message.innerHTML = '<div>⌕</div><h3>没有找到匹配项目</h3><p>试试更换名称、账号或网址关键词。</p>';
    list.append(message);
  }
  for (const entry of entries) {
    const card = document.createElement('article');
    card.className = 'entry-card';
    card.tabIndex = 0;
    card.dataset.id = entry.id;
    const icon = document.createElement('div');
    icon.className = 'entry-icon';
    icon.textContent = [...entry.title][0]?.toUpperCase() || '密';
    const info = document.createElement('div');
    info.className = 'entry-info';
    const title = document.createElement('div');
    title.className = 'entry-title';
    title.textContent = entry.title;
    if (entry.favorite) { const star = document.createElement('span'); star.textContent = '★'; title.append(star); }
    const meta = document.createElement('div');
    meta.className = 'entry-meta';
    meta.textContent = [folderById(entry.folderId)?.name, entry.username, entry.website].filter(Boolean).join('  ·  ') || '未填写账号信息';
    info.append(title, meta);
    const actions = document.createElement('div');
    actions.className = 'entry-actions';
    if (entry.username) actions.append(actionButton('复制账号', '账号'));
    if (entry.hasPassword) actions.append(actionButton('复制密码', '密码'));
    card.append(icon, info, actions);
    card.addEventListener('click', () => openEditor(entry.id));
    card.addEventListener('keydown', (e) => { if (e.key === 'Enter') openEditor(entry.id); });
    actions.querySelectorAll('button').forEach((button) => button.addEventListener('click', async (event) => {
      event.stopPropagation();
      await copyField(entry.id, button.dataset.field);
    }));
    list.append(card);
  }
}

function actionButton(label, text) {
  const button = document.createElement('button');
  button.type = 'button';
  button.title = label;
  button.dataset.field = label === '复制账号' ? 'username' : 'password';
  button.textContent = text;
  return button;
}

async function copyField(id, field) {
  try { await window.vaultApi.copy(id, field); toast(`${field === 'password' ? '密码' : '账号'}已复制，30 秒后自动清除`); }
  catch (error) { toast(error.message); }
}

function clearEditor() {
  $('entryForm').reset();
  $('entryId').value = '';
  $('password').type = 'password';
  $('togglePassword').textContent = '显示';
  $('entryError').textContent = '';
  $('deleteBtn').classList.add('hidden');
  $('copyUsername').classList.add('hidden');
  $('copyPassword').classList.add('hidden');
  $('openWebsite').classList.add('hidden');
  updateStrength();
}

async function openEditor(id = '') {
  clearEditor();
  $('editorBackdrop').classList.remove('hidden');
  if (id) {
    try {
      const entry = await window.vaultApi.get(id);
      $('editorTitle').textContent = '编辑项目';
      for (const field of ['id', 'title', 'username', 'password', 'website', 'notes']) $(field === 'id' ? 'entryId' : field).value = entry[field] || '';
      $('folderId').value = entry.folderId || '';
      $('favorite').checked = entry.favorite;
      $('deleteBtn').classList.remove('hidden');
      $('copyUsername').classList.toggle('hidden', !entry.username);
      $('copyPassword').classList.toggle('hidden', !entry.password);
      $('openWebsite').classList.toggle('hidden', !entry.website);
      updateStrength();
    } catch (error) { closeEditor(); toast(error.message); }
  } else {
    $('editorTitle').textContent = '新建项目';
    if (state.filter.startsWith('folder:')) $('folderId').value = state.filter.slice(7);
    else if (state.filter === 'unfiled') $('folderId').value = '';
    setTimeout(() => $('title').focus(), 0);
  }
}

function closeEditor() {
  $('editorBackdrop').classList.add('hidden');
  $('confirmBackdrop').classList.add('hidden');
  clearEditor();
}

async function saveEntry(event) {
  event.preventDefault();
  const submit = $('entryForm').querySelector('[type="submit"]');
  setBusy(submit, true, '正在保存…');
  $('entryError').textContent = '';
  try {
    await window.vaultApi.save({
      id: $('entryId').value, title: $('title').value, username: $('username').value,
      password: $('password').value, website: $('website').value, notes: $('notes').value,
      favorite: $('favorite').checked, folderId: $('folderId').value
    });
    closeEditor();
    await refreshVault();
    toast('项目已安全保存');
  } catch (error) { $('entryError').textContent = error.message; }
  finally { setBusy(submit, false); }
}

function generatePassword() {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghijkmnopqrstuvwxyz';
  const numbers = '23456789';
  const symbols = '!@#$%^&*()-_=+';
  const all = upper + lower + numbers + symbols;
  const values = new Uint32Array(20);
  crypto.getRandomValues(values);
  const chars = [upper[values[0] % upper.length], lower[values[1] % lower.length], numbers[values[2] % numbers.length], symbols[values[3] % symbols.length]];
  for (let i = 4; i < 20; i++) chars.push(all[values[i] % all.length]);
  for (let i = chars.length - 1; i > 0; i--) { const j = values[i] % (i + 1); [chars[i], chars[j]] = [chars[j], chars[i]]; }
  $('password').value = chars.join('');
  $('password').type = 'text';
  $('togglePassword').textContent = '隐藏';
  updateStrength();
  toast('已生成 20 位强密码');
}

function updateStrength() {
  const value = $('password').value;
  $('strengthRow').classList.toggle('hidden', !value);
  let score = 0;
  if (value.length >= 8) score++;
  if (value.length >= 14) score++;
  if (/[a-z]/.test(value) && /[A-Z]/.test(value)) score++;
  if (/\d/.test(value) && /[^\w]/.test(value)) score++;
  const labels = ['较弱', '一般', '良好', '很强'];
  const colors = ['#ef4444', '#f59e0b', '#3b82f6', '#22c55e'];
  $('strengthText').textContent = labels[Math.max(0, score - 1)];
  document.querySelectorAll('.strength-row i').forEach((bar, index) => { bar.style.background = index < score ? colors[Math.max(0, score - 1)] : '#e5e7eb'; });
}

async function deleteCurrent() {
  try {
    await window.vaultApi.delete($('entryId').value);
    closeEditor();
    await refreshVault();
    toast('项目已删除');
  } catch (error) { toast(error.message); }
}

function openFolderEditor(id = '') {
  $('folderForm').reset();
  $('folderEditId').value = '';
  $('folderError').textContent = '';
  $('deleteFolderBtn').classList.add('hidden');
  $('folderDialogTitle').textContent = '新建文件夹';
  if (id) {
    const folder = folderById(id);
    if (!folder) return;
    $('folderEditId').value = folder.id;
    $('folderName').value = folder.name;
    $('folderDialogTitle').textContent = '管理文件夹';
    $('deleteFolderBtn').classList.remove('hidden');
  }
  $('folderBackdrop').classList.remove('hidden');
  setTimeout(() => { $('folderName').focus(); $('folderName').select(); }, 0);
}

function closeFolderEditor() {
  $('folderBackdrop').classList.add('hidden');
  $('folderConfirmBackdrop').classList.add('hidden');
  $('folderForm').reset();
  $('folderError').textContent = '';
}

async function saveFolder(event) {
  event.preventDefault();
  const submit = $('folderForm').querySelector('[type="submit"]');
  setBusy(submit, true, '正在保存…');
  $('folderError').textContent = '';
  try {
    await window.vaultApi.saveFolder({ id: $('folderEditId').value, name: $('folderName').value });
    closeFolderEditor();
    await refreshVault();
    toast('文件夹已保存');
  } catch (error) { $('folderError').textContent = error.message; }
  finally { setBusy(submit, false); }
}

async function deleteCurrentFolder() {
  try {
    const id = $('folderEditId').value;
    const result = await window.vaultApi.deleteFolder(id);
    if (state.filter === `folder:${id}`) state.filter = 'all';
    closeFolderEditor();
    await refreshVault();
    selectFilter(state.filter);
    toast(result.movedEntries ? `文件夹已删除，${result.movedEntries} 个项目已移至未分类` : '文件夹已删除');
  } catch (error) { toast(error.message); }
}

$('authForm').addEventListener('submit', submitAuth);
$('toggleMaster').addEventListener('click', () => { const input = $('masterPassword'); input.type = input.type === 'password' ? 'text' : 'password'; $('toggleMaster').textContent = input.type === 'password' ? '显示' : '隐藏'; });
$('newBtn').addEventListener('click', () => openEditor());
$('emptyNewBtn').addEventListener('click', () => openEditor());
$('addFolderBtn').addEventListener('click', () => openFolderEditor());
$('closeEditor').addEventListener('click', closeEditor);
$('cancelBtn').addEventListener('click', closeEditor);
$('entryForm').addEventListener('submit', saveEntry);
$('generateBtn').addEventListener('click', generatePassword);
$('password').addEventListener('input', updateStrength);
$('togglePassword').addEventListener('click', () => { const input = $('password'); input.type = input.type === 'password' ? 'text' : 'password'; $('togglePassword').textContent = input.type === 'password' ? '显示' : '隐藏'; });
$('copyUsername').addEventListener('click', () => copyField($('entryId').value, 'username'));
$('copyPassword').addEventListener('click', () => copyField($('entryId').value, 'password'));
$('openWebsite').addEventListener('click', async () => { try { await window.vaultApi.openWebsite($('website').value); } catch (error) { $('entryError').textContent = error.message; } });
$('deleteBtn').addEventListener('click', () => $('confirmBackdrop').classList.remove('hidden'));
$('confirmCancel').addEventListener('click', () => $('confirmBackdrop').classList.add('hidden'));
$('confirmDelete').addEventListener('click', deleteCurrent);
$('folderForm').addEventListener('submit', saveFolder);
$('folderCancelBtn').addEventListener('click', closeFolderEditor);
$('deleteFolderBtn').addEventListener('click', () => $('folderConfirmBackdrop').classList.remove('hidden'));
$('folderConfirmCancel').addEventListener('click', () => $('folderConfirmBackdrop').classList.add('hidden'));
$('folderConfirmDelete').addEventListener('click', deleteCurrentFolder);
$('lockBtn').addEventListener('click', lock);
$('backupBtn').addEventListener('click', async () => { try { if (await window.vaultApi.export()) toast('加密保险库已备份'); } catch (error) { toast(error.message); } });
$('searchInput').addEventListener('input', (e) => { state.query = e.target.value.trim(); renderEntries(); });
document.querySelectorAll('[data-filter]').forEach((button) => button.addEventListener('click', () => {
  selectFilter(button.dataset.filter);
}));
document.addEventListener('keydown', (event) => {
  if (event.ctrlKey && event.key.toLowerCase() === 'k' && !$('appView').classList.contains('hidden')) { event.preventDefault(); $('searchInput').focus(); }
  if (event.key === 'Escape' && !$('folderConfirmBackdrop').classList.contains('hidden')) $('folderConfirmBackdrop').classList.add('hidden');
  else if (event.key === 'Escape' && !$('folderBackdrop').classList.contains('hidden')) closeFolderEditor();
  else if (event.key === 'Escape' && !$('editorBackdrop').classList.contains('hidden')) closeEditor();
});
for (const eventName of ['pointerdown', 'keydown']) {
  document.addEventListener(eventName, () => {
    if ($('appView').classList.contains('hidden') || Date.now() - lastTouch < TOUCH_THROTTLE_MS) return;
    lastTouch = Date.now();
    window.vaultApi.touch().catch(() => {});
  }, { passive: true });
}
window.vaultApi.onLocked(() => { closeEditor(); closeFolderEditor(); showLockScreen(); toast('长时间未操作，保险库已自动锁定'); });
initialize().catch((error) => { $('authError').textContent = `启动失败：${error.message}`; });
