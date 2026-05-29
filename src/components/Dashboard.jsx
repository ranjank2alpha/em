import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Send, Trash2, LogOut, MessageSquare, ArrowUp, ArrowDown, Scale, HelpCircle, X, Search, Download } from 'lucide-react';
import { USER_GUIDE } from '../data/guide';
import { parseTransactionWithNLP, searchUserGuide, generateFilterSpec, answerLedgerQuery } from '../lib/gemini';

export default function Dashboard({ session }) {
  const [ledger, setLedger] = useState([]);
  const [comments, setComments] = useState({}); // { ledger_id: [comments] }
  const [loading, setLoading] = useState(true);
  const [nlpText, setNlpText] = useState('');
  const [parsing, setParsing] = useState(false);
  const [commentInputs, setCommentInputs] = useState({});
  const [expandedRows, setExpandedRows] = useState({}); // { id: bool }
  const [editingRow, setEditingRow] = useState(null); // id
  const [profiles, setProfiles] = useState([]);
  const [categories, setCategories] = useState([]);
  const [pendingTransaction, setPendingTransaction] = useState(null);
  const [categoryConfirm, setCategoryConfirm] = useState('');
  const [useExistingCategory, setUseExistingCategory] = useState(false);

  // Query mode state
  const [activeTab, setActiveTab] = useState('log');
  const [queryText, setQueryText] = useState('');
  const [querying, setQuerying] = useState(false);
  const [queryResponse, setQueryResponse] = useState(null);

  // Help Guide State
  const [showHelp, setShowHelp] = useState(false);
  const [helpQuery, setHelpQuery] = useState('');
  const [searchingHelp, setSearchingHelp] = useState(false);
  const [highlightedSection, setHighlightedSection] = useState(null);

  useEffect(() => {
    fetchData();
    fetchProfiles();
    fetchCategories();
  }, []);

  const handleHelpSearch = async (e) => {
    e.preventDefault();
    if (!helpQuery.trim()) return;
    setSearchingHelp(true);
    try {
      const result = await searchUserGuide(helpQuery, USER_GUIDE);
      setHighlightedSection(result.sectionId);
      if (result.sectionId) {
        const el = document.getElementById(`guide-${result.sectionId}`);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSearchingHelp(false);
    }
  };

  const fetchCategories = async () => {
    const { data } = await supabase.from('categories').select('name').order('name');
    setCategories(data || []);
  };

  const fetchProfiles = async () => {
    const { data } = await supabase.from('profiles').select('*');
    console.log("Profiles Data:", data);
    setProfiles(data || []);
  };

  const fetchData = async () => {
    try {
      // Fetch ledger
      const { data: ledgerData, error: ledgerError } = await supabase
        .from('ledger')
        .select(`*, profiles!user_id(name)`)
        .order('transaction_date', { ascending: false });
      
      if (ledgerError) throw ledgerError;
      console.log("Raw Ledger Data:", ledgerData);
      setLedger(ledgerData || []);

      // Fetch comments
      const { data: commentsData, error: commentsError } = await supabase
        .from('comments')
        .select(`*, profiles!user_id(name)`)
        .order('created_at', { ascending: true });
        
      if (commentsError) throw commentsError;
      
      const groupedComments = {};
      commentsData.forEach(c => {
        if (!groupedComments[c.ledger_id]) groupedComments[c.ledger_id] = [];
        groupedComments[c.ledger_id].push(c);
      });
      setComments(groupedComments);
    } catch (error) {
      console.error('Error fetching data:', error);
      alert(`Error fetching data: ${error.message || JSON.stringify(error)}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
  };

  const handleNLPSubmit = async (e) => {
    e.preventDefault();
    if (!nlpText.trim() || parsing) return;
    setParsing(true);
    try {
      const parsed = await parseTransactionWithNLP(nlpText, categories);

      // If Gemini wants a new category, pause and ask the user to confirm
      if (parsed.is_new_category && parsed.category) {
        setPendingTransaction({ ...parsed, raw_text: nlpText.trim() });
        setCategoryConfirm(parsed.category);
        setUseExistingCategory(false);
        setParsing(false);
        return; // Wait for user to confirm via modal
      }

      await commitTransaction(parsed, nlpText.trim());
    } catch (error) {
      alert(error.message);
    } finally {
      setParsing(false);
    }
  };

  const commitTransaction = async (parsed, rawText) => {
    // Look up transfer_to ID if recipient detected
    let transferToId = null;
    if (parsed.recipient) {
      const recipientProfile = profiles.find(p => p.name.toLowerCase().includes(parsed.recipient.toLowerCase()));
      if (recipientProfile) transferToId = recipientProfile.id;
    }

    const { error } = await supabase.from('ledger').insert([{
      user_id: session.user.id,
      amount: parsed.amount,
      type: parsed.type,
      category: parsed.category,
      description: parsed.description,
      raw_text: rawText,
      transfer_to: transferToId,
      transaction_date: parsed.date,
    }]);

    if (error) throw error;
    setNlpText('');
    fetchData();
  };

  const handleCategoryConfirm = async () => {
    if (!pendingTransaction) return;
    const finalCategory = useExistingCategory
      ? categoryConfirm  // user picked an existing one from dropdown
      : categoryConfirm; // user edited or accepted the new name

    const isNew = !categories.some(c => c.name === finalCategory);

    try {
      // Insert new category to DB if it's truly new
      if (isNew) {
        const { error: catError } = await supabase
          .from('categories')
          .insert([{ name: finalCategory }]);
        if (catError) throw catError;
        await fetchCategories();
      }

      await commitTransaction({ ...pendingTransaction, category: finalCategory }, pendingTransaction.raw_text);
    } catch (error) {
      alert(error.message);
    } finally {
      setPendingTransaction(null);
    }
  };

  // ─── CSV Download Helper ─────────────────────────────────────────────────
  const downloadCSV = (data, filename = 'transactions') => {
    const headers = ['Date', 'Type', 'Category', 'Amount (INR)', 'Description', 'Logged By'];
    const rows = data.map(row => [
      row.transaction_date,
      row.type,
      row.category,
      row.amount,
      `"${(row.description || '').replace(/"/g, '""')}"`,
      row.profiles?.name || ''
    ]);
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filename}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ─── Query Pipeline ──────────────────────────────────────────────────────
  const handleQuery = async (e) => {
    e.preventDefault();
    if (!queryText.trim() || querying) return;
    setQuerying(true);
    setQueryResponse(null);

    try {
      // Step 1: Protocol Tier (Gemma) — generate a filter spec from the question
      const filterSpec = await generateFilterSpec(queryText, categories);
      console.log('Filter spec:', filterSpec);

      let dataForGemini;

      if (filterSpec.fallback) {
        // Complex query — pass full ledger to Gemini
        console.log('Fallback: using full ledger dataset');
        dataForGemini = ledger;
      } else {
        // Simple query — build targeted Supabase fetch
        let query = supabase.from('ledger').select(`
          id, amount, type, category, description, transaction_date,
          profiles!user_id(name),
          recipient:profiles!transfer_to(name)
        `);

        const f = filterSpec.filters || {};
        if (f.type) query = query.eq('type', f.type);
        if (f.category) query = query.eq('category', f.category);
        if (f.categories?.length) query = query.in('category', f.categories);
        if (f.date_from) query = query.gte('transaction_date', f.date_from);
        if (f.date_to) query = query.lte('transaction_date', f.date_to);
        if (f.amount_min) query = query.gte('amount', f.amount_min);
        if (f.amount_max) query = query.lte('amount', f.amount_max);

        const { data, error } = await query.order('transaction_date', { ascending: false });
        if (error) throw error;

        // Apply name-based filters in JS (never filter nullable columns at DB level)
        let filtered = data || [];
        if (f.user_name) {
          filtered = filtered.filter(row =>
            row.profiles?.name?.toLowerCase().includes(f.user_name.toLowerCase())
          );
        }
        if (f.transfer_to_name) {
          filtered = filtered.filter(row =>
            row.recipient?.name?.toLowerCase().includes(f.transfer_to_name.toLowerCase())
          );
        }

        dataForGemini = filtered;
      }

      // Trigger CSV download if requested
      if (filterSpec.download && dataForGemini.length > 0) {
        downloadCSV(dataForGemini, filterSpec.download_filename || 'transactions');
      }

      // Step 2: Insight Tier (Gemini) — answer the question from fetched data
      const answer = await answerLedgerQuery(queryText, dataForGemini);
      setQueryResponse(answer);

    } catch (error) {
      setQueryResponse(`Sorry, something went wrong: ${error.message}`);
    } finally {
      setQuerying(false);
    }
  };

  const handleDeleteTransaction = async (id) => {
    if (!window.confirm('Are you sure you want to delete this transaction?')) return;
    try {
      const { error } = await supabase.from('ledger').delete().eq('id', id);
      if (error) throw error;
      fetchData();
    } catch (error) {
      alert('Error deleting transaction. You can only delete your own entries.');
    }
  };

  const handleUpdateTransaction = async (id, updates) => {
    try {
      const { error } = await supabase.from('ledger').update(updates).eq('id', id);
      if (error) throw error;
      setEditingRow(null);
      fetchData();
    } catch (error) {
      alert('Error updating transaction.');
    }
  };

  const handleAddComment = async (ledgerId) => {
    const text = commentInputs[ledgerId];
    if (!text || !text.trim()) return;
    try {
      const { error } = await supabase.from('comments').insert([
        {
          ledger_id: ledgerId,
          user_id: session.user.id,
          content: text.trim()
        }
      ]);
      if (error) throw error;
      setCommentInputs({ ...commentInputs, [ledgerId]: '' });
      fetchData();
    } catch (error) {
      alert('Error adding comment.');
    }
  };

  const handleDeleteComment = async (id) => {
    try {
      const { error } = await supabase.from('comments').delete().eq('id', id);
      if (error) throw error;
      fetchData();
    } catch (error) {
      alert('Error deleting comment.');
    }
  };

  // -------------------------------------------------------------------------
  // Segment Ledger Logic
  // -------------------------------------------------------------------------
  
  // A helper to normalize a transaction for a specific user view (Virtual Entries)
  const getNormalizedLedger = (userType) => {
    const result = [];
    console.log(`Normalizing ledger for ${userType}. Total ledger items:`, ledger.length);
    ledger.forEach(item => {
      const isRanjanEntry = item.profiles?.name?.toLowerCase().includes('ranjan') || item.profiles?.name?.toLowerCase().includes('rakant');
      const isAshishEntry = item.profiles?.name?.toLowerCase().includes('ashish') || item.profiles?.name?.toLowerCase().includes('rikant') || item.profiles?.name?.toLowerCase().includes('karan') || item.profiles?.name?.toLowerCase().includes('ridhi');
      
      // Look up who it was transferred TO
      const recipientProfile = profiles.find(p => p.id === item.transfer_to);
      const isToRanjan = recipientProfile?.name?.toLowerCase().includes('ranjan') || recipientProfile?.name?.toLowerCase().includes('rakant');
      const isToAshish = recipientProfile?.name?.toLowerCase().includes('ashish') || recipientProfile?.name?.toLowerCase().includes('rikant') || recipientProfile?.name?.toLowerCase().includes('karan') || recipientProfile?.name?.toLowerCase().includes('ridhi');

      if (userType === 'ranjan') {
        if (isRanjanEntry) {
          result.push({ ...item, displayAmount: item.type === 'income' ? item.amount : -item.amount });
        } else if (isToRanjan) {
          // If paid TO Ranjan, it's Income (+amount) for Ranjan
          result.push({ ...item, displayAmount: item.amount, displayType: 'income' });
        }
      } else if (userType === 'ashish') {
        if (isAshishEntry) {
          result.push({ ...item, displayAmount: item.type === 'income' ? item.amount : -item.amount });
        } else if (isToAshish) {
          // If paid TO Ashish, it's Income (+amount) for Ashish
          result.push({ ...item, displayAmount: item.amount, displayType: 'income' });
        }
      } else if (userType === 'estate') {
        // Skip Internal Transfers in the Estate view
        if (item.category === 'Internal Transfer') return;

        // Estate shows the actual entry
        result.push({ ...item, displayAmount: item.type === 'income' ? item.amount : -item.amount });
      }
    });
    return result;
  };






              


  if (loading) return <div className="text-center mt-4">Loading Dashboard...</div>;

  return (
    <div>
      <div className="flex-between mb-4">
        <div className="flex-item" style={{ gap: '0.5rem' }}>
          Welcome, <strong>{session.user.email.split('@')[0].split('.')[0]}</strong>
          <button 
            className="btn-icon" 
            style={{ width: 'auto', padding: '0 0.5rem', background: 'transparent' }} 
            onClick={() => setShowHelp(true)}
            title="Help Guide"
          >
            <HelpCircle size={18} />
          </button>
        </div>
        <button className="btn btn-outline" onClick={handleSignOut}>
          <LogOut size={16} /> Sign Out
        </button>
      </div>

      <div className="card nlp-container">
        {/* Tab Toggle */}
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.2rem' }}>
          <button
            className={`btn ${activeTab === 'log' ? 'btn-primary' : 'btn-outline'}`}
            style={{ flex: 1, padding: '0.5rem' }}
            onClick={() => setActiveTab('log')}
          >
            Log
          </button>
          <button
            className={`btn ${activeTab === 'query' ? 'btn-primary' : 'btn-outline'}`}
            style={{ flex: 1, padding: '0.5rem' }}
            onClick={() => { setActiveTab('query'); setQueryResponse(null); }}
          >
            Query
          </button>
        </div>

        {/* Log Mode */}
        {activeTab === 'log' && (
          <form onSubmit={handleNLPSubmit} className="nlp-wrapper">
            <textarea
              className="input w-full nlp-textarea"
              placeholder="e.g. 'Paid 20k to Ashish for Staff Salary'"
              value={nlpText}
              onChange={(e) => setNlpText(e.target.value)}
              disabled={parsing}
            />
            <button
              type="submit" className="btn btn-primary nlp-submit"
              disabled={parsing || !nlpText.trim()}
            >
              {parsing ? <div className="loading-spinner"></div> : <Send size={18} />}
            </button>
          </form>
        )}

        {/* Query Mode */}
        {activeTab === 'query' && (
          <div>
            <form onSubmit={handleQuery} className="nlp-wrapper">
              <textarea
                className="input w-full nlp-textarea"
                placeholder="e.g. 'Total spent on Legal?' or 'Download all Staff Salary payments'"
                value={queryText}
                onChange={(e) => setQueryText(e.target.value)}
                disabled={querying}
              />
              <button
                type="submit" className="btn btn-primary nlp-submit"
                disabled={querying || !queryText.trim()}
              >
                {querying ? <div className="loading-spinner"></div> : <Search size={18} />}
              </button>
            </form>

            {queryResponse && (
              <div style={{
                marginTop: '1rem',
                padding: '1rem',
                background: 'rgba(0,0,0,0.15)',
                borderRadius: '10px',
                border: '1px solid rgba(255,255,255,0.07)',
                fontSize: '0.88rem',
                lineHeight: '1.6',
                color: 'var(--text-secondary)',
                whiteSpace: 'pre-wrap'
              }}>
                <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--color-accent, #888)', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>AI Answer</div>
                {queryResponse}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="ledgers-grid">
        {(() => {
          const emailLocalPart = session.user.email.split('@')[0].toLowerCase();
          const currentUserKey = emailLocalPart.split('.')[0];
          const userKeys = ['ranjan', 'ashish'];
          // Put current user first, then the other
          const orderedKeys = userKeys.sort((a, b) => (a === currentUserKey ? -1 : 1));
          
          return (
            <>
              {orderedKeys.map(key => (
                <LedgerTable 
                  key={key} 
                  title={key.charAt(0).toUpperCase() + key.slice(1)} 
                  data={getNormalizedLedger(key)} 
                  expandedRows={expandedRows}
                  setExpandedRows={setExpandedRows}
                  editingRow={editingRow}
                  setEditingRow={setEditingRow}
                  categories={categories}
                  handleUpdateTransaction={handleUpdateTransaction}
                  handleDeleteTransaction={handleDeleteTransaction}
                  comments={comments}
                  commentInputs={commentInputs}
                  setCommentInputs={setCommentInputs}
                  handleAddComment={handleAddComment}
                  handleDeleteComment={handleDeleteComment}
                  session={session}
                />
              ))}
              <LedgerTable 
                title="K2Alpha" 
                data={getNormalizedLedger('estate')} 
                expandedRows={expandedRows}
                setExpandedRows={setExpandedRows}
                editingRow={editingRow}
                setEditingRow={setEditingRow}
                categories={categories}
                handleUpdateTransaction={handleUpdateTransaction}
                handleDeleteTransaction={handleDeleteTransaction}
                comments={comments}
                commentInputs={commentInputs}
                setCommentInputs={setCommentInputs}
                handleAddComment={handleAddComment}
                handleDeleteComment={handleDeleteComment}
                session={session}
              />
            </>
          );
        })()}
      </div>

      {showHelp && (
        <div className="help-overlay" onClick={() => setShowHelp(false)}>
          <div className="help-panel" onClick={e => e.stopPropagation()}>
            <div className="flex-between mb-4">
              <h3 style={{ margin: 0 }}>rkem Guide</h3>
              <button className="btn-icon" onClick={() => setShowHelp(false)}>
                <X size={20} />
              </button>
            </div>
            
            <form onSubmit={handleHelpSearch} className="nlp-wrapper mb-6">
              <input 
                type="text" className="input w-full" 
                placeholder="Ask how to use rkem..." 
                value={helpQuery}
                onChange={(e) => setHelpQuery(e.target.value)}
              />
              <button type="submit" className="btn btn-primary" disabled={searchingHelp} style={{ padding: '0.4rem' }}>
                {searchingHelp ? <div className="loading-spinner" style={{ width: '14px', height: '14px' }}></div> : <Search size={16} />}
              </button>
            </form>

            <div className="help-content">
              {USER_GUIDE.map(section => (
                <div 
                  key={section.id} 
                  id={`guide-${section.id}`}
                  className={`guide-section ${highlightedSection === section.id ? 'highlighted' : ''}`}
                >
                  <h4 className="mb-2">{section.title}</h4>
                  <p style={{ margin: 0, fontSize: '0.85rem', lineHeight: '1.4', color: 'var(--text-secondary)' }}>
                    {section.content}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
      {pendingTransaction && (
        <div className="help-overlay" onClick={() => setPendingTransaction(null)}>
          <div className="help-panel" style={{ maxWidth: '420px' }} onClick={e => e.stopPropagation()}>
            <div className="flex-between mb-4">
              <h3 style={{ margin: 0 }}>New Category Detected</h3>
              <button className="btn-icon" onClick={() => setPendingTransaction(null)}>
                <X size={20} />
              </button>
            </div>

            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1.2rem' }}>
              AI suggested a new category for this transaction. Review and confirm, or pick an existing one.
            </p>

            <div style={{ background: 'rgba(255,255,255,0.05)', padding: '0.8rem', borderRadius: '8px', marginBottom: '1.2rem', fontSize: '0.8rem' }}>
              <div style={{ marginBottom: '0.2rem' }}><strong>Amount:</strong> ₹{Math.abs(pendingTransaction.amount).toLocaleString('en-IN')}</div>
              <div><strong>Description:</strong> {pendingTransaction.description}</div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', cursor: 'pointer' }}>
                <input
                  type="radio"
                  checked={!useExistingCategory}
                  onChange={() => {
                    setUseExistingCategory(false);
                    setCategoryConfirm(pendingTransaction.category);
                  }}
                />
                Use new category (editable):
              </label>
              {!useExistingCategory && (
                <input
                  type="text"
                  className="input"
                  value={categoryConfirm}
                  onChange={(e) => setCategoryConfirm(e.target.value)}
                  style={{ marginLeft: '1.5rem' }}
                  placeholder="Category name..."
                />
              )}

              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', cursor: 'pointer' }}>
                <input
                  type="radio"
                  checked={useExistingCategory}
                  onChange={() => {
                    setUseExistingCategory(true);
                    setCategoryConfirm(categories[0]?.name || '');
                  }}
                />
                Use an existing category:
              </label>
              {useExistingCategory && (
                <select
                  className="input"
                  value={categoryConfirm}
                  onChange={(e) => setCategoryConfirm(e.target.value)}
                  style={{ marginLeft: '1.5rem' }}
                >
                  {categories.map(cat => (
                    <option key={cat.name} value={cat.name}>{cat.name}</option>
                  ))}
                </select>
              )}
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.5rem', justifyContent: 'flex-end' }}>
              <button className="btn btn-outline" onClick={() => setPendingTransaction(null)}>
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={handleCategoryConfirm}
                disabled={!categoryConfirm.trim()}
              >
                Confirm & Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const LedgerTable = ({ 
  title, 
  data, 
  expandedRows, 
  setExpandedRows, 
  editingRow, 
  setEditingRow, 
  categories, 
  handleUpdateTransaction, 
  handleDeleteTransaction, 
  comments, 
  commentInputs, 
  setCommentInputs, 
  handleAddComment, 
  handleDeleteComment, 
  session 
}) => {
  let income = 0;
  let expense = 0;
  data.forEach(item => {
    if (item.displayAmount > 0) income += Number(item.displayAmount);
    else expense += Math.abs(Number(item.displayAmount));
  });

  return (
    <div className="mb-8">
      <div className="flex-between mb-4">
        <h3 style={{ margin: 0, fontSize: '1rem' }}>{title}</h3>
        <div style={{ fontSize: '0.8rem', textAlign: 'right', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <span className="text-success" style={{ display: 'inline-flex', alignItems: 'center', gap: '2px' }}>
            <ArrowUp size={12} /> ₹{income.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </span>
          <span className="text-danger" style={{ display: 'inline-flex', alignItems: 'center', gap: '2px' }}>
            <ArrowDown size={12} /> ₹{expense.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '2px', fontWeight: 700 }}>
            <Scale size={12} /> ₹{(income - expense).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </span>
        </div>
      </div>
      <div className="ledger-table-wrapper">
      <table className="ledger-table">
        <thead>
          <tr>
            <th className="col-date">Date</th>
            <th className="col-category">Category</th>
            <th className="col-amount">Amount</th>
            <th style={{ width: '40px' }}></th>
          </tr>
        </thead>
        <tbody>
          {data.map((item) => {
            const baseId = item.id.replace('-virtual', '');
            const isExpanded = expandedRows[baseId];
            const isEditing = editingRow === baseId;
            
            return (
              <React.Fragment key={item.id}>
                <tr className="hover-row">
                  <td>
                    {isEditing ? (
                      <input 
                        type="date" 
                        className="input" 
                        style={{ padding: '0.1rem', fontSize: '0.7rem' }}
                        defaultValue={item.transaction_date}
                        onBlur={(e) => handleUpdateTransaction(baseId, { transaction_date: e.target.value })}
                      />
                    ) : (
                      new Date(item.transaction_date).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' })
                    )}
                  </td>
                  <td>
                    {isEditing ? (
                      <select 
                        className="input" 
                        style={{ padding: '0.2rem' }}
                        value={item.category}
                        onChange={(e) => handleUpdateTransaction(baseId, { category: e.target.value })}
                      >
                        {categories.map(cat => (
                          <option key={cat.name} value={cat.name}>{cat.name}</option>
                        ))}
                      </select>
                    ) : (
                      <span className="tag">{item.category}</span>
                    )}
                  </td>
                  <td className={`col-amount ${item.displayAmount > 0 ? 'text-success' : 'text-danger'}`}>
                    {isEditing ? (
                      <input 
                        type="number" 
                        className="input" 
                        style={{ padding: '0.1rem', fontSize: '0.7rem', width: '60px', textAlign: 'right' }}
                        defaultValue={Math.abs(item.displayAmount)}
                        onBlur={(e) => handleUpdateTransaction(baseId, { amount: parseFloat(e.target.value) })}
                      />
                    ) : (
                      `₹${Math.abs(item.displayAmount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`
                    )}
                  </td>
                  <td>
                    <div className="transaction-actions" onClick={(e) => e.stopPropagation()}>
                      <button 
                        className={`btn-icon ${isExpanded === 'D' ? 'active' : ''}`} 
                        title="Details"
                        onClick={() => setExpandedRows({ ...expandedRows, [baseId]: isExpanded === 'D' ? null : 'D' })}
                      >
                        <span style={{ fontWeight: 800 }}>D</span>
                      </button>
                      <button 
                        className={`btn-icon ${isExpanded === 'C' ? 'active' : ''}`} 
                        title="Comments"
                        onClick={() => setExpandedRows({ ...expandedRows, [baseId]: isExpanded === 'C' ? null : 'C' })}
                      >
                        <span style={{ fontWeight: 800 }}>C</span>
                      </button>
                      <button 
                        className="btn-icon" 
                        title="Edit"
                        onClick={() => {
                          const newEditing = isEditing ? null : baseId;
                          setEditingRow(newEditing);
                          if (newEditing && isExpanded !== 'D') {
                            setExpandedRows({ ...expandedRows, [baseId]: 'D' });
                          }
                        }}
                        disabled={item.id.includes('virtual') || item.user_id !== session.user.id}
                      >
                        <span style={{ fontWeight: 800 }}>E</span>
                      </button>
                      <button 
                        className="btn-icon btn-icon-danger" 
                        title="Delete"
                        onClick={() => handleDeleteTransaction(baseId)}
                        disabled={item.id.includes('virtual') || item.user_id !== session.user.id}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
                {isExpanded && (
                  <tr className="expanded-row">
                    <td colSpan="4">
                      <div className="p-4" style={{ background: 'rgba(0,0,0,0.1)' }}>
                        {isExpanded === 'D' ? (
                          <div>
                            <div className="mb-2">
                              <strong>Description:</strong> 
                              {isEditing ? (
                                <input 
                                  className="input" 
                                  style={{ width: '100%', marginTop: '0.25rem' }}
                                  defaultValue={item.description}
                                  onBlur={(e) => handleUpdateTransaction(baseId, { description: e.target.value })}
                                />
                              ) : (
                                ` ${item.description}`
                              )}
                            </div>
                            {item.raw_text && (
                              <div className="col-audit">
                                <div className="audit-tag">AI Audit</div>
                                {item.raw_text}
                              </div>
                            )}
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
                              Logged by {item.profiles?.name || 'Unknown'}
                            </div>
                          </div>
                        ) : (
                          <div className="comments-section" style={{ borderTop: 'none', marginTop: 0 }}>
                            {(comments[baseId] || []).map(comment => (
                              <div key={comment.id} className="comment">
                                <div className="comment-header">
                                  <span className="comment-author">{comment.profiles?.name || 'User'}</span>
                                  <div className="flex-item">
                                    <span className="comment-time">
                                      {new Date(comment.created_at).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })}
                                    </span>
                                    {comment.user_id === session.user.id && (
                                      <button className="btn-icon btn-icon-danger" style={{ padding: '0.2rem' }} onClick={() => handleDeleteComment(comment.id)}>
                                        <Trash2 size={14} />
                                      </button>
                                    )}
                                  </div>
                                </div>
                                <div>{comment.content}</div>
                              </div>
                            ))}
                            <div className="comment-input-wrapper">
                              <input 
                                type="text" className="input" placeholder="Add a comment..."
                                value={commentInputs[baseId] || ''}
                                onChange={(e) => setCommentInputs({...commentInputs, [baseId]: e.target.value})}
                                onKeyDown={(e) => e.key === 'Enter' && handleAddComment(baseId)}
                              />
                              <button className="btn btn-outline" style={{ padding: '0.4rem 0.8rem' }} onClick={() => handleAddComment(baseId)}>
                                <MessageSquare size={16} />
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
      </div>
    </div>
  );
};
