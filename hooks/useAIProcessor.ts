
import { useState, useCallback } from 'react';
import { useApp } from '../context/AppContext';
import { financeService } from '../services/financeService';
import { shareToWhatsApp, formatCustomerStatement, formatSupplierStatement } from '../services/shareService';
import { FunctionCall, Type } from '@google/genai'; // Import Type for FunctionDeclaration type in args
import { Sale, Purchase, Voucher, Expense, Customer, Supplier, QatCategory } from '../types';


export const useAIProcessor = () => {
  const { 
    sales, customers, purchases, vouchers, suppliers, expenses,
    addSale, addPurchase, addVoucher, addExpense,
    addCustomer, addSupplier, deleteSale, deletePurchase, deleteVoucher, deleteExpense,
    addNotification
  } = useApp();

  const [pendingAction, setPendingAction] = useState<FunctionCall | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);

  const validateToolCall = useCallback((name: string, args: FunctionCall['args']) => {
    // التحقق من وجود الأشخاص للعمليات التي تتطلب ذلك
    if (['recordSale', 'recordVoucher', 'shareStatement', 'deleteTransaction', 'updateTransaction'].includes(name)) {
      const searchName = (args?.customer_name || args?.person_name || args?.supplier_name || "").trim();
      if (!searchName) return true;

      const list = [...customers, ...suppliers];
      const match = list.find(p => p.name.includes(searchName));
      
      if (!match && name !== 'managePerson') {
        addNotification("تنبيه ⚠️", `الاسم "${searchName}" غير موجود في السجلات.`, "warning");
        return false;
      }
    }
    return true;
  }, [customers, suppliers, addNotification]);

  const executeAction = useCallback(async () => {
    if (!pendingAction || isExecuting) return;
    
    const { name, args } = pendingAction;
    setIsExecuting(true);

    try {
      switch (name) {
        case 'recordSale': {
          const target = customers.find((c: Customer) => c.name.includes(args?.customer_name as string));
          await addSale({ 
            ...args, 
            customer_id: target!.id, 
            customer_name: target!.name, 
            quantity: Number(args?.quantity) || 0, // Ensure numeric
            unit_price: Number(args?.unit_price) || 0, // Ensure numeric
            total: (Number(args?.quantity) || 0) * (Number(args?.unit_price) || 0), 
            date: new Date().toISOString() 
          });
          break;
        }
        case 'recordPurchase': {
          const target = suppliers.find((s: Supplier) => s.name.includes(args?.supplier_name as string));
          await addPurchase({ 
            ...args, 
            supplier_id: target!.id, 
            supplier_name: target!.name, 
            quantity: Number(args?.quantity) || 0, // Ensure numeric
            unit_price: Number(args?.unit_price) || 0, // Ensure numeric
            total: (Number(args?.quantity) || 0) * (Number(args?.unit_price) || 0), 
            date: new Date().toISOString() 
          });
          break;
        }
        case 'recordVoucher': {
          const list = args?.type === 'قبض' ? customers : suppliers;
          const target = list.find((p: Customer | Supplier) => p.name.includes(args?.person_name as string));
          await addVoucher({ 
            ...args, 
            person_id: target!.id, 
            person_name: target!.name, 
            person_type: args?.type === 'قبض' ? 'عميل' : 'مورد', 
            amount: Number(args?.amount) || 0, // Ensure numeric
            date: new Date().toISOString() 
          });
          break;
        }
        case 'recordExpense': {
          await addExpense({ 
            ...args, 
            amount: Number(args?.amount) || 0, // Ensure numeric
            date: new Date().toISOString() 
          });
          break;
        }
        case 'managePerson': {
          if (args?.type === 'عميل') await addCustomer({ name: args.name as string, phone: args.phone as string || '' });
          else await addSupplier({ name: args?.name as string, phone: args?.phone as string || '' });
          break;
        }
        case 'deleteTransaction': {
          const searchName = args?.person_name as string;
          let targetRecord: Sale | Purchase | Voucher | Expense | undefined = undefined;
          
          if (args?.record_type === 'sale') targetRecord = sales.find((s: Sale) => s.customer_name.includes(searchName));
          else if (args?.record_type === 'purchase') targetRecord = purchases.find((p: Purchase) => p.supplier_name.includes(searchName));
          else if (args?.record_type === 'voucher') targetRecord = vouchers.find((v: Voucher) => v.person_name.includes(searchName));
          else if (args?.record_type === 'expense') targetRecord = expenses.find((e: Expense) => e.title.includes(searchName));

          if (targetRecord) {
             if (args?.record_type === 'sale') await deleteSale(targetRecord.id);
             else if (args?.record_type === 'purchase') await deletePurchase(targetRecord.id);
             else if (args?.record_type === 'voucher') await deleteVoucher(targetRecord.id);
             else if (args?.record_type === 'expense') await deleteExpense(targetRecord.id);
             addNotification("تم الحذف 🗑️", "تم حذف العملية بنجاح.", "success");
          } else {
             addNotification("خطأ ⚠️", "لم أجد العملية المطلوبة لحذفها.", "warning");
          }
          break;
        }
        case 'updateTransaction': {
          const searchName = args?.person_name as string;
          let targetRecord: Sale | Purchase | Voucher | undefined = undefined;
          
          if (args?.record_type === 'sale') targetRecord = sales.find((s: Sale) => s.customer_name.includes(searchName));
          else if (args?.record_type === 'purchase') targetRecord = purchases.find((p: Purchase) => p.supplier_name.includes(searchName));
          else if (args?.record_type === 'voucher') targetRecord = vouchers.find((v: Voucher) => v.person_name.includes(searchName));

          if (targetRecord) {
             const updated = { 
               ...targetRecord, 
               amount: (args?.new_amount as number) || (targetRecord as any).amount || (targetRecord as any).total,
               total: (args?.new_amount as number) || (targetRecord as any).amount || (targetRecord as any).total, // For sales/purchases
               unit_price: (args?.new_amount && (args?.new_quantity || (targetRecord as any).quantity)) ? 
                             (Number(args.new_amount) / (Number(args.new_quantity) || (targetRecord as any).quantity)) : 
                             (targetRecord as any).unit_price,
               quantity: (args?.new_quantity as number) || (targetRecord as any).quantity,
               notes: args?.new_notes as string || (targetRecord as any).notes
             };
             if (args?.record_type === 'sale') await addSale(updated);
             else if (args?.record_type === 'purchase') await addPurchase(updated);
             else if (args?.record_type === 'voucher') await addVoucher(updated);
             addNotification("تم التعديل ✅", "تم تحديث البيانات بنجاح.", "success");
          } else {
            addNotification("خطأ ⚠️", "لم أجد العملية المطلوبة لتعديلها.", "warning");
          }
          break;
        }
        case 'shareStatement': {
          const list = args?.person_type === 'عميل' ? customers : suppliers;
          const person = list.find(p => p.name.includes(args?.person_name as string));
          if (person) {
             const balances = args?.person_type === 'عميل' 
                ? financeService.getCustomerBalances(person.id, sales, vouchers)
                : financeService.getSupplierBalances(person.id, purchases, vouchers);
             const text = args?.person_type === 'عميل' 
                ? formatCustomerStatement(person as Customer, sales, vouchers, balances)
                : formatSupplierStatement(person as Supplier, purchases, vouchers, balances);
             shareToWhatsApp(text, person.phone);
          }
          break;
        }
      }

      setPendingAction(null);
    } catch (err: any) {
      addNotification("فشل التنفيذ ⚠️", err.message || "حدث خطأ غير متوقع.", "warning");
    } finally {
      setIsExecuting(false);
    }
  }, [
    pendingAction, isExecuting, 
    customers, suppliers, sales, purchases, vouchers, expenses, 
    addSale, addPurchase, addVoucher, addExpense, addCustomer, addSupplier, 
    deleteSale, deletePurchase, deleteVoucher, deleteExpense,
    addNotification, 
    // External services that don't need to be in the dependency array (functions are stable references)
    // financeService, formatCustomerStatement, formatSupplierStatement, shareToWhatsApp
  ]);

  // FIX: Add a return statement to expose the state and functions
  return {
    pendingAction,
    setPendingAction,
    validateToolCall,
    executeAction,
    isExecuting,
    setIsExecuting,
  };
};
