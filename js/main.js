(
    () =>
        {
            'use strict';
            const byId = id => document.getElementById(id);
            const numberFormat = new Intl.NumberFormat('fa-IR', {maximumFractionDigits: 2});
            const sections = ['materials', 'labor', 'other'];
            const sectionLabels = {materials: 'مصالح', labor: 'دستمزد', other: 'هزینه جانبی'};
            const monthNames = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'];
            const persianFormatter = new Intl.DateTimeFormat('en-US-u-ca-persian', {year: 'numeric', month: 'numeric', day: 'numeric'});
            const faDigits = value => String(value).replace(/[0-9]/g, digit => '۰۱۲۳۴۵۶۷۸۹'[Number(digit)]);
            const latinDigits = value => String(value).replace(/[۰-۹]/g, digit => String(digit.charCodeAt(0) - 1776))
            .replace(/[٠-٩]/g, digit => String(digit.charCodeAt(0) - 1632));
            const formatMoney = value => numberFormat.format(Math.round(value));
            const setText = (id, value) => {byId(id).textContent = value;};
            
            // Accept ungrouped numbers or correctly grouped thousands; reject ambiguous commas.
            function normalizedNumber(value)
            {
                const input = latinDigits(value).trim().replace(/٫/g, '.').replace(/٬/g, ',');
                if(input === '') return '';
                if(/،|\s/.test(input)) return null;
                if(!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/.test(input)) return null;
                return input.replace(/,/g, '');
            }

            // Preserve the exact entered decimal precision in invoice columns.
            function formatEnteredNumber(value)
            {
                const clean = normalizedNumber(value);
                if(clean === null || clean === '') return '—';
                const [whole, fraction] = clean.split('.');
                const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, '٬');
                return faDigits(grouped + (fraction === undefined ? '' : '٫' + fraction));
            }

            function parseNumber(value)
            {
                const clean = normalizedNumber(value);
                return clean === '' ? 0 : clean === null ? NaN : Number(clean);
            }

            // Decimal arithmetic avoids binary floating-point half-rounding errors.
            function decimalParts(value)
            {
                const clean = normalizedNumber(value);
                if(clean === null || clean === '') return null;
                const [whole, fraction = ''] = clean.split('.');
                return {digits: BigInt(whole + fraction), scale: 10n ** BigInt(fraction.length)};
            }

            function roundedDecimalProduct(first, second)
            {
                const a = decimalParts(first), b = decimalParts(second);
                if(!a || !b) return NaN;
                const denominator = a.scale * b.scale;
                const result = (a.digits * b.digits * 2n + denominator) / (2n * denominator);
                return result <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(result) : NaN;
            }

            function roundedPercent(amount, rateInput)
            {
                const rate = decimalParts(String(rateInput).trim() === '' ? '0' : rateInput);
                if(!rate || !Number.isSafeInteger(amount) || amount < 0) return NaN;
                const denominator = rate.scale * 100n;
                const result = (BigInt(amount) * rate.digits * 2n + denominator) / (2n * denominator);
                return result <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(result) : NaN;
            }

            function validNumber(value, maximum)
            {
                return Number.isFinite(value) && value >= 0 && value <= maximum;
            }
            
            function persianParts(date)
            {
                const parts = {};
                for(const part of persianFormatter.formatToParts(date))
                    {
                        if(['year', 'month', 'day'].includes(part.type)) parts[part.type] = Number(part.value);
                    }
                    return parts;
            }
            
            function findNowruz(gregorianYear, jalaliYear)
            {
                for(let day = 18; day <= 24; day++)
                    {
                        const date = new Date(gregorianYear, 2, day, 12);
                        const parts = persianParts(date);
                        if(parts.year === jalaliYear && parts.month === 1 && parts.day === 1) return date;
                    }
                    return null;
            }
            
            function isJalaliLeap(year)
            {
                const first = findNowruz(year + 621, year);
                const next = findNowruz(year + 622, year + 1);
                return Boolean(first && next && Math.round((next - first) / 86400000) === 366);
            }
            
            function parseJalaliDate(input)
            {
                const match = /^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/.exec(latinDigits(input).trim());
                if(!match) return null;
                const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
                if(year < 1300 || year > 1600 || month < 1 || month > 12 || day < 1) return null;
                const daysInMonth = month <= 6 ? 31 : month <= 11 ? 30 : isJalaliLeap(year) ? 30 : 29;
                return day <= daysInMonth ? {year, month, day} : null;
            }

            function todayJalali()
            {
                const {year, month, day} = persianParts(new Date());
                return faDigits(`${year}/${String(month).padStart(2, '0')}/${String(day).padStart(2, '0')}`);
            }

            function addRow(section, data = {})
            {
                const row = document.createElement('div');
                row.className = 'cost-row';
                row.dataset.section = section;
                row.innerHTML = `<input class="item-name" type="text" maxlength="100" aria-label="شرح هزینه" placeholder="عنوان هزینه یا خدمت"> <input class="qty" type="text" inputmode="decimal" aria-label="تعداد" placeholder="تعداد"> <input class="price" type="text" inputmode="decimal" aria-label="قیمت واحد به تومان" placeholder="قیمت واحد(تومان)"> <output class="line-amount" aria-label="جمع مبلغ این ردیف">۰</output> <button type="button" class="delete-row" aria-label="حذف ردیف" title="حذف ردیف"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18m-2 0-1 14H6L5 6m4 0V4h6v2"/></svg></button>`;
                row.querySelector('.item-name').value = data.name ?? '';
                row.querySelector('.qty').value = data.qty ?? '';
                row.querySelector('.price').value = data.price ?? '';
                row.querySelectorAll('input').forEach(input => input.addEventListener('input', refresh));
                row.querySelector('.delete-row').addEventListener('click', () => {row.remove(); refresh();});
                byId(`${section}Items`).append(row);
                return row;
            }
            
            function collectRows()
            {
                
                let invalid = false;
                const rows = [];
                const totals = {materials: 0, labor: 0, other: 0};
                for(const section of sections)
                    {
                        for(const row of byId(`${section}Items`).children)
                            {
                                const nameField = row.querySelector('.item-name');
                                const quantityField = row.querySelector('.qty');
                                const priceField = row.querySelector('.price');
                                const name = nameField.value.trim();
                                const quantity = parseNumber(quantityField.value);
                                const price = parseNumber(priceField.value);
                                const used = Boolean(name || quantityField.value.trim() || priceField.value.trim());
                                const quantityOK = validNumber(quantity, 1e8) && quantity > 0;
                                const priceOK = validNumber(price, 1e12) && Boolean(priceField.value.trim());
                                const amount = quantityOK && priceOK ? roundedDecimalProduct(quantityField.value, priceField.value) : NaN;
                                const amountOK = Number.isSafeInteger(amount) && amount >= 0;
                                const rowOK = Boolean(name) && quantityOK && priceOK && amountOK;
                                nameField.setAttribute('aria-invalid', String(used && !name));
                                quantityField.setAttribute('aria-invalid', String(used && !quantityOK));
                                priceField.setAttribute('aria-invalid', String(used && !priceOK));
                                row.querySelector('.line-amount').textContent = used && quantityOK && priceOK && amountOK ? formatMoney(amount) : used ? '—' : '۰';
                                if(used && !rowOK) invalid = true;
                                if(used && rowOK)
                                    {
                                        totals[section] += amount;
                                        rows.push({section, name, quantity, price, quantityInput: quantityField.value, priceInput: priceField.value, amount});
                                    }
                            }
                    }
                    return {rows, totals, invalid};
            }
            
            function appendCell(tr, value, className = '')
            {
                const td = document.createElement('td');
                td.textContent = value;
                if(className) td.className = className;
                tr.append(td);
                return td;
            }

            function renderItems(rows)
            {
                const tbody = byId('pItems');
                tbody.replaceChildren();
                for(const item of rows)
                {
                    const tr = document.createElement('tr');
                    const titleCell = appendCell(tr, item.name);
                    const type = document.createElement('span');
                    type.className = 'item-type';
                    type.textContent = sectionLabels[item.section];
                    titleCell.append(type);
                    appendCell(tr, formatEnteredNumber(item.quantityInput));
                    appendCell(tr, formatEnteredNumber(item.priceInput));
                    appendCell(tr, formatMoney(item.amount));
                    tbody.append(tr);
                }
                
                if(!rows.length)
                    {
                        const tr = document.createElement('tr');
                        const td = appendCell(tr, 'هزینه‌ای ثبت نشده است.', 'no-items');
                        td.colSpan = 4;
                        tbody.append(tr);
                    }
            }
            
            function refresh()
            {
                const {rows, totals, invalid: rowsInvalid} = collectRows();
                let invalid = rowsInvalid;
                for(const section of sections) setText(`${section}Total`, `${formatMoney(totals[section])} تومان`);
                const profit = parseNumber(byId('profit').value);
                const taxRate = parseNumber(byId('taxRate').value);
                const area = parseNumber(byId('area').value);
                const taxEnabled = byId('taxEnabled').checked;
                const profitOK = validNumber(profit, 1000);
                const taxOK = !taxEnabled || Boolean(byId('taxRate').value.trim()) && validNumber(taxRate, 100);
                const areaOK = !byId('area').value.trim() || validNumber(area, 1e9);
                const dateInput = byId('date').value.trim();
                const date = dateInput ? parseJalaliDate(dateInput) : null;
                const dateOK = !dateInput || Boolean(date);
                invalid ||= !profitOK || !taxOK || !areaOK || !dateOK;
                byId('profit').setAttribute('aria-invalid', String(!profitOK));
                byId('taxRate').setAttribute('aria-invalid', String(!taxOK));
                byId('area').setAttribute('aria-invalid', String(!areaOK));
                byId('date').setAttribute('aria-invalid', String(!dateOK));
                const subtotal = totals.materials + totals.labor + totals.other;
                const baseType = byId('profitBase').value;
                const base = baseType === 'labor' ? totals.labor : baseType === 'direct' ? totals.materials + totals.labor : subtotal;
                const profitAmount = profitOK ? roundedPercent(base, byId('profit').value) : 0;
                const taxAmount = taxEnabled && taxOK ? roundedPercent(subtotal + profitAmount, byId('taxRate').value) : 0;
                const total = subtotal + profitAmount + taxAmount;
                if(![subtotal, profitAmount, taxAmount, total].every(Number.isSafeInteger)) invalid = true;
                setText('pProject', byId('project').value.trim() || 'عنوان کار');
                setText('pProvider', byId('provider').value.trim() || '—');
                setText('pClient', byId('client').value.trim() || '—');
                setText('pDate', date ? faDigits(`${date.day} ${monthNames[date.month - 1]} ${date.year}`) : dateInput ? 'تاریخ نامعتبر' : '—');
                setText('pArea', byId('area').value.trim() && areaOK ? `${numberFormat.format(area)} متر مربع` : '—');
                renderItems(rows);
                setText('pMaterials', formatMoney(totals.materials));
                setText('pLabor', formatMoney(totals.labor));
                setText('pOther', formatMoney(totals.other));
                setText('pSubtotal', formatMoney(subtotal));
                const baseTitle = baseType === 'labor' ? 'دستمزد' : baseType === 'direct' ? 'مصالح و دستمزد' : 'تمام هزینه‌ها';
                setText('pProfitLabel', `سود(${profitOK ? numberFormat.format(profit) : '—'}٪ از ${baseTitle})`);
                setText('pProfit', formatMoney(profitAmount));
                byId('pTaxLine').hidden = !taxEnabled;
                setText('pTaxLabel', `مالیات(${taxEnabled && taxOK ? numberFormat.format(taxRate) : '—'}٪)`);
                setText('pTax', formatMoney(taxAmount));
                setText('pGrandValue', invalid ? '—' : formatMoney(total));
                setText('heroTotal', invalid ? '—' : formatMoney(total));
                setText('heroCosts', formatMoney(subtotal));
                setText('heroProfit', formatMoney(profitAmount));
                const note = byId('notes').value.trim();
                byId('pNotes').hidden = !note;
                setText('pNotes', note);
                byId('errors').hidden = !invalid;
                byId('errors').textContent = invalid ? 'برخی اطلاعات نامعتبر یا ناقص هستند. لطفاً مقادیر و تاریخ را بررسی کنید.' : '';
                byId('printBtn').disabled = invalid;
            }

            function clearForm()
            {
                for(const section of sections)
                    {
                        byId(`${section}Items`).replaceChildren();
                        addRow(section);
                    }
                    for(const id of ['project', 'provider', 'client', 'area', 'notes', 'taxRate']) byId(id).value = '';
                    byId('date').value = todayJalali();
                    byId('profit').value = '۰';
                    byId('profitBase').value = 'all';
                    byId('taxEnabled').checked = false;
                    byId('taxContent').hidden = true;
                    refresh();
            }
            
            document.querySelectorAll('[data-add]').forEach
            (
                button => button.addEventListener
                (
                    'click', () =>
                        {
                            const row = addRow(button.dataset.add);
                            row.querySelector('.item-name').focus();
                            refresh();
                        }
                )
            );
            
            for(const id of ['project', 'provider', 'client', 'area', 'date', 'profit', 'profitBase', 'taxRate', 'notes'])
                {
                    byId(id).addEventListener('input', refresh);
                }
                byId('profitBase').addEventListener('change', refresh);
                byId('taxEnabled').addEventListener
                (
                    'change', () => 
                        {
                            byId('taxContent').hidden = !byId('taxEnabled').checked;
                            refresh();
                        }
                );
                byId('clearAll').addEventListener('click', clearForm);
                const print = () => {refresh(); if(!byId('printBtn').disabled) window.print();};
                byId('printBtn').addEventListener('click', print);
                clearForm();
        }
)();