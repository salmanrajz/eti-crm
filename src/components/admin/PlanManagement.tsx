import { useState, useEffect } from 'react';
import { collection, addDoc, updateDoc, deleteDoc, doc, getDocs, query, orderBy } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { toast } from 'react-hot-toast';
import { Plus, Edit, Trash2, Save, X, Package, Upload, Download, CheckSquare, Square } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { read, utils, writeFile } from 'xlsx';

interface Plan {
  id?: string;
  name: string;
  category: string;
  description?: string;
  benefits: string; // Benefits for WhatsApp verification
  amount: string; // Monthly amount
  duration: string; // Contract duration in years
  isActive: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

interface PlanCategory {
  id?: string;
  name: string;
  description?: string;
  isActive: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export function PlanManagement() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [categories, setCategories] = useState<PlanCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingPlan, setEditingPlan] = useState<Plan | null>(null);
  const [editingCategory, setEditingCategory] = useState<PlanCategory | null>(null);
  const [showPlanForm, setShowPlanForm] = useState(false);
  const [showCategoryForm, setShowCategoryForm] = useState(false);
  const [activeTab, setActiveTab] = useState<'plans' | 'categories'>('plans');
  const [uploadingPlans, setUploadingPlans] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({ current: 0, total: 0, success: 0, failed: 0 });
  const [selectedPlanIds, setSelectedPlanIds] = useState<string[]>([]);

  // Form states
  const [planForm, setPlanForm] = useState({
    name: '',
    category: '',
    description: '',
    benefits: '',
    amount: '',
    duration: '',
    isActive: true
  });

  const [categoryForm, setCategoryForm] = useState({
    name: '',
    description: '',
    isActive: true
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      
      // Load categories first
      const categoriesQuery = query(collection(db, 'planCategories'), orderBy('name'));
      const categoriesSnapshot = await getDocs(categoriesQuery);
      const categoriesData = categoriesSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as PlanCategory[];
      
      // If no categories exist, create default ones
      if (categoriesData.length === 0) {
        await createDefaultCategories();
        // Reload categories after creating defaults
        const newCategoriesSnapshot = await getDocs(categoriesQuery);
        const newCategoriesData = newCategoriesSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as PlanCategory[];
        setCategories(newCategoriesData);
      } else {
        setCategories(categoriesData);
      }

      // Load plans
      const plansQuery = query(collection(db, 'plans'), orderBy('category'), orderBy('name'));
      const plansSnapshot = await getDocs(plansQuery);
      const plansData = plansSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Plan[];
      setPlans(plansData);
    } catch (error) {
      console.error('Error loading data:', error);
      toast.error('Failed to load plans and categories');
    } finally {
      setLoading(false);
    }
  };

  const createDefaultCategories = async () => {
    const defaultCategories = [
      {
        name: 'New Freedom Plans',
        description: 'Latest freedom plans with flexible options',
        isActive: true
      },
      {
        name: 'Freedom Plans (Old)',
        description: 'Legacy freedom plans',
        isActive: true
      },
      {
        name: 'Smart Plans',
        description: 'Smart data and voice plans',
        isActive: true
      },
      {
        name: 'Emirati Plans',
        description: 'Special plans for Emirati customers',
        isActive: true
      },
      {
        name: 'Premium Postpaid Plans',
        description: 'Premium postpaid subscription plans',
        isActive: true
      },
      {
        name: 'Home WiFi Plans',
        description: 'Home WiFi and internet plans',
        isActive: true
      }
    ];

    const defaultPlans = [
      // New Freedom Plans
      { 
        name: 'NewFreedom125-12M-Local', 
        category: 'New Freedom Plans', 
        description: '125 AED for 12 months with local minutes',
        benefits: '1000 local minutes, Non-Stop Data (up to 3 Mbps)',
        amount: '125',
        duration: '1'
      },
      { 
        name: 'NewFreedom150-NC-Local', 
        category: 'New Freedom Plans', 
        description: '150 AED no commitment with local minutes',
        benefits: '500 flexible minutes, Non-Stop Data (up to 3 Mbps)',
        amount: '150',
        duration: '1'
      },
      { 
        name: 'NewFreedom200-12M-Flexi', 
        category: 'New Freedom Plans', 
        description: '200 AED for 12 months with flexible minutes',
        benefits: '900 flexible minutes, Non-Stop Data (up to 10 Mbps)',
        amount: '200',
        duration: '1'
      },
      
      // Smart Plans
      { 
        name: 'Smart 50', 
        category: 'Smart Plans', 
        description: 'Smart plan with 50GB data',
        benefits: '50GB data, 100 local minutes',
        amount: '50',
        duration: '1'
      },
      { 
        name: 'Smart 100', 
        category: 'Smart Plans', 
        description: 'Smart plan with 100GB data',
        benefits: '100GB data, 200 local minutes',
        amount: '100',
        duration: '1'
      },
      { 
        name: 'Smart Unlimited', 
        category: 'Smart Plans', 
        description: 'Smart plan with unlimited data',
        benefits: 'Unlimited data, 500 local minutes',
        amount: '200',
        duration: '1'
      },
      
      // Emirati Plans
      { 
        name: 'Emirati Special 200', 
        category: 'Emirati Plans', 
        description: 'Special plan for Emirati customers',
        benefits: 'Unlimited local calls, 20GB data',
        amount: '200',
        duration: '1'
      },
      { 
        name: 'Emirati Premium 500', 
        category: 'Emirati Plans', 
        description: 'Premium plan for Emirati customers',
        benefits: 'Unlimited local calls, 40GB data',
        amount: '500',
        duration: '1'
      },
      
      // Home WiFi Plans
      { 
        name: 'Basic Home WiFi', 
        category: 'Home WiFi Plans', 
        description: 'Basic home internet connection',
        benefits: '10 Mbps speed, 100GB data',
        amount: '150',
        duration: '1'
      },
      { 
        name: 'Standard Home WiFi', 
        category: 'Home WiFi Plans', 
        description: 'Standard home internet connection',
        benefits: '25 Mbps speed, 200GB data',
        amount: '250',
        duration: '1'
      },
      { 
        name: 'Premium Home WiFi', 
        category: 'Home WiFi Plans', 
        description: 'Premium home internet connection',
        benefits: '50 Mbps speed, Unlimited data',
        amount: '350',
        duration: '1'
      }
    ];

    try {
      // Create categories first
      for (const category of defaultCategories) {
        await addDoc(collection(db, 'planCategories'), {
          ...category,
          createdAt: new Date(),
          updatedAt: new Date()
        });
      }

      // Create sample plans
      for (const plan of defaultPlans) {
        await addDoc(collection(db, 'plans'), {
          ...plan,
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date()
        });
      }

      toast.success('Default categories and sample plans created successfully');
    } catch (error) {
      console.error('Error creating default data:', error);
      toast.error('Failed to create default data');
    }
  };

  const handleSavePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!planForm.name.trim() || !planForm.category.trim()) {
      toast.error('Please fill in all required fields');
      return;
    }

    try {
      const planData = {
        ...planForm,
        updatedAt: new Date()
      };

      if (editingPlan) {
        await updateDoc(doc(db, 'plans', editingPlan.id!), planData);
        setPlans(prev => prev.map(p => p.id === editingPlan.id ? { ...p, ...planData } : p));
        toast.success('Plan updated successfully');
      } else {
        const docRef = await addDoc(collection(db, 'plans'), {
          ...planData,
          createdAt: new Date()
        });
        setPlans(prev => [...prev, { id: docRef.id, ...planData }]);
        toast.success('Plan created successfully');
      }

      setShowPlanForm(false);
      setEditingPlan(null);
      setPlanForm({ name: '', category: '', description: '', benefits: '', amount: '', duration: '', isActive: true });
    } catch (error) {
      console.error('Error saving plan:', error);
      toast.error('Failed to save plan');
    }
  };

  const handleSaveCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!categoryForm.name.trim()) {
      toast.error('Please fill in the category name');
      return;
    }

    try {
      const categoryData = {
        ...categoryForm,
        updatedAt: new Date()
      };

      if (editingCategory) {
        await updateDoc(doc(db, 'planCategories', editingCategory.id!), categoryData);
        setCategories(prev => prev.map(c => c.id === editingCategory.id ? { ...c, ...categoryData } : c));
        toast.success('Category updated successfully');
      } else {
        const docRef = await addDoc(collection(db, 'planCategories'), {
          ...categoryData,
          createdAt: new Date()
        });
        setCategories(prev => [...prev, { id: docRef.id, ...categoryData }]);
        toast.success('Category created successfully');
      }

      setShowCategoryForm(false);
      setEditingCategory(null);
      setCategoryForm({ name: '', description: '', isActive: true });
    } catch (error) {
      console.error('Error saving category:', error);
      toast.error('Failed to save category');
    }
  };

  const handleEditPlan = (plan: Plan) => {
    setEditingPlan(plan);
    setPlanForm({
      name: plan.name,
      category: plan.category,
      description: plan.description || '',
      benefits: plan.benefits || '',
      amount: plan.amount || '',
      duration: plan.duration || '',
      isActive: plan.isActive
    });
    setShowPlanForm(true);
  };

  const handleEditCategory = (category: PlanCategory) => {
    setEditingCategory(category);
    setCategoryForm({
      name: category.name,
      description: category.description || '',
      isActive: category.isActive
    });
    setShowCategoryForm(true);
  };

  const handleDeletePlan = async (planId: string) => {
    if (!confirm('Are you sure you want to delete this plan?')) return;

    try {
      await deleteDoc(doc(db, 'plans', planId));
      setPlans(prev => prev.filter(p => p.id !== planId));
      toast.success('Plan deleted successfully');
    } catch (error) {
      console.error('Error deleting plan:', error);
      toast.error('Failed to delete plan');
    }
  };

  const handleDeleteCategory = async (categoryId: string) => {
    // Check if category is used by any plans
    const plansUsingCategory = plans.filter(p => p.category === categories.find(c => c.id === categoryId)?.name);
    if (plansUsingCategory.length > 0) {
      toast.error('Cannot delete category that is being used by plans');
      return;
    }

    if (!confirm('Are you sure you want to delete this category?')) return;

    try {
      await deleteDoc(doc(db, 'planCategories', categoryId));
      setCategories(prev => prev.filter(c => c.id !== categoryId));
      toast.success('Category deleted successfully');
    } catch (error) {
      console.error('Error deleting category:', error);
      toast.error('Failed to delete category');
    }
  };

  const resetForms = () => {
    setPlanForm({ name: '', category: '', description: '', isActive: true });
    setCategoryForm({ name: '', description: '', isActive: true });
    setEditingPlan(null);
    setEditingCategory(null);
  };

  // Handle plan selection
  const handlePlanSelect = (planId: string) => {
    setSelectedPlanIds(prev => 
      prev.includes(planId) 
        ? prev.filter(id => id !== planId)
        : [...prev, planId]
    );
  };

  // Handle select all plans
  const handleSelectAll = () => {
    if (selectedPlanIds.length === plans.length) {
      setSelectedPlanIds([]);
    } else {
      setSelectedPlanIds(plans.filter(p => p.id).map(p => p.id!));
    }
  };

  // Bulk activate plans
  const handleBulkActivate = async () => {
    if (selectedPlanIds.length === 0) {
      toast.error('Please select at least one plan');
      return;
    }

    try {
      const updatePromises = selectedPlanIds.map(planId =>
        updateDoc(doc(db, 'plans', planId), {
          isActive: true,
          updatedAt: new Date()
        })
      );

      await Promise.all(updatePromises);
      toast.success(`Activated ${selectedPlanIds.length} plan(s) successfully`);
      setSelectedPlanIds([]);
      await loadData();
    } catch (error) {
      console.error('Error activating plans:', error);
      toast.error('Failed to activate plans');
    }
  };

  // Bulk deactivate plans
  const handleBulkDeactivate = async () => {
    if (selectedPlanIds.length === 0) {
      toast.error('Please select at least one plan');
      return;
    }

    try {
      const updatePromises = selectedPlanIds.map(planId =>
        updateDoc(doc(db, 'plans', planId), {
          isActive: false,
          updatedAt: new Date()
        })
      );

      await Promise.all(updatePromises);
      toast.success(`Deactivated ${selectedPlanIds.length} plan(s) successfully`);
      setSelectedPlanIds([]);
      await loadData();
    } catch (error) {
      console.error('Error deactivating plans:', error);
      toast.error('Failed to deactivate plans');
    }
  };

  // Bulk delete plans
  const handleBulkDelete = async () => {
    if (selectedPlanIds.length === 0) {
      toast.error('Please select at least one plan');
      return;
    }

    if (!confirm(`Are you sure you want to delete ${selectedPlanIds.length} plan(s)? This action cannot be undone.`)) {
      return;
    }

    try {
      const deletePromises = selectedPlanIds.map(planId =>
        deleteDoc(doc(db, 'plans', planId))
      );

      await Promise.all(deletePromises);
      toast.success(`Deleted ${selectedPlanIds.length} plan(s) successfully`);
      setSelectedPlanIds([]);
      await loadData();
    } catch (error) {
      console.error('Error deleting plans:', error);
      toast.error('Failed to delete plans');
    }
  };

  // Download template Excel file
  const downloadTemplate = () => {
    const templateData = [
      {
        'Plan Name': 'Example Plan 1',
        'Category': 'New Freedom Plans',
        'Description': 'Example plan description',
        'Benefits': '1000 local minutes, Non-Stop Data (up to 3 Mbps)',
        'Amount (AED)': '250',
        'Duration (Years)': '1',
        'Is Active': 'Yes'
      },
      {
        'Plan Name': 'Example Plan 2',
        'Category': 'Smart Plans',
        'Description': 'Another example plan',
        'Benefits': '50GB data, 100 local minutes',
        'Amount (AED)': '100',
        'Duration (Years)': '1',
        'Is Active': 'Yes'
      }
    ];

    const ws = utils.json_to_sheet(templateData);
    const wb = utils.book_new();
    utils.book_append_sheet(wb, ws, 'Plans');
    
    // Set column widths
    const colWidths = [
      { wch: 20 }, // Plan Name
      { wch: 20 }, // Category
      { wch: 30 }, // Description
      { wch: 40 }, // Benefits
      { wch: 15 }, // Amount
      { wch: 15 }, // Duration
      { wch: 12 }  // Is Active
    ];
    ws['!cols'] = colWidths;

    writeFile(wb, 'Plan_Template.xlsx');
    toast.success('Template downloaded successfully');
  };

  // Handle Excel file upload
  const handleExcelUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Reset input
    event.target.value = '';

    if (!file.name.match(/\.(xlsx|xls)$/i)) {
      toast.error('Please upload a valid Excel file (.xlsx or .xls)');
      return;
    }

    try {
      setUploadingPlans(true);
      const data = await file.arrayBuffer();
      const workbook = read(data);
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = utils.sheet_to_json(worksheet);

      if (!Array.isArray(jsonData) || jsonData.length === 0) {
        toast.error('Excel file is empty or invalid format');
        setUploadingPlans(false);
        return;
      }

      // Validate and process plans
      const validPlans: Plan[] = [];
      const errors: string[] = [];

      jsonData.forEach((row: any, index: number) => {
        const rowNumber = index + 2; // Account for header row

        // Normalize column names (handle different variations)
        const planName = row['Plan Name'] || row['plan name'] || row['PlanName'] || row['planName'] || row['Name'] || row['name'];
        const category = row['Category'] || row['category'] || row['Category Name'] || row['categoryName'];
        const description = row['Description'] || row['description'] || row['Desc'] || row['desc'] || '';
        const benefits = row['Benefits'] || row['benefits'] || row['Benefit'] || row['benefit'] || '';
        const amount = row['Amount (AED)'] || row['amount'] || row['Amount'] || row['Price'] || row['price'] || '';
        const duration = row['Duration (Years)'] || row['duration'] || row['Duration'] || row['durationYears'] || '1';
        const isActive = row['Is Active'] || row['isActive'] || row['IsActive'] || row['Active'] || row['active'] || 'Yes';

        // Validation
        if (!planName || !planName.toString().trim()) {
          errors.push(`Row ${rowNumber}: Plan Name is required`);
          return;
        }

        if (!category || !category.toString().trim()) {
          errors.push(`Row ${rowNumber}: Category is required`);
          return;
        }

        // Check if category exists
        const categoryExists = categories.some(cat => 
          cat.name.toLowerCase() === category.toString().trim().toLowerCase()
        );

        if (!categoryExists) {
          errors.push(`Row ${rowNumber}: Category "${category}" does not exist. Please create it first or use an existing category.`);
          return;
        }

        // Convert isActive to boolean
        const activeValue = typeof isActive === 'string' 
          ? isActive.toString().toLowerCase().trim() === 'yes' || isActive.toString().toLowerCase().trim() === 'true'
          : Boolean(isActive);

        validPlans.push({
          name: planName.toString().trim(),
          category: category.toString().trim(),
          description: description ? description.toString().trim() : '',
          benefits: benefits ? benefits.toString().trim() : '',
          amount: amount ? amount.toString().trim() : '',
          duration: duration ? duration.toString().trim() : '1',
          isActive: activeValue
        } as Plan);
      });

      if (errors.length > 0) {
        toast.error(`Found ${errors.length} validation error(s). Please check the console.`);
        console.error('Validation errors:', errors);
        setUploadingPlans(false);
        return;
      }

      if (validPlans.length === 0) {
        toast.error('No valid plans found in the Excel file');
        setUploadingPlans(false);
        return;
      }

      // Upload plans to Firestore
      let successCount = 0;
      let failedCount = 0;

      setUploadProgress({
        total: validPlans.length,
        current: 0,
        success: 0,
        failed: 0
      });

      for (const [index, plan] of validPlans.entries()) {
        try {
          await addDoc(collection(db, 'plans'), {
            ...plan,
            createdAt: new Date(),
            updatedAt: new Date()
          });

          successCount++;
          setUploadProgress({
            total: validPlans.length,
            current: index + 1,
            success: successCount,
            failed: failedCount
          });
        } catch (error) {
          console.error(`Error creating plan ${plan.name}:`, error);
          failedCount++;
          setUploadProgress({
            total: validPlans.length,
            current: index + 1,
            success: successCount,
            failed: failedCount
          });
        }
      }

      // Reload data
      await loadData();

      toast.success(`Successfully imported ${successCount} plan(s)`);
      if (failedCount > 0) {
        toast.error(`Failed to import ${failedCount} plan(s)`);
      }

      setUploadingPlans(false);
      setUploadProgress({ current: 0, total: 0, success: 0, failed: 0 });
      setShowPlanForm(false);
    } catch (error) {
      console.error('Error reading Excel file:', error);
      toast.error('Failed to read Excel file. Please ensure the file format is correct.');
      setUploadingPlans(false);
      setUploadProgress({ current: 0, total: 0, success: 0, failed: 0 });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900" />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="bg-white shadow rounded-lg overflow-hidden">
        <div className="px-4 py-5 sm:p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-lg leading-6 font-medium text-gray-900">Plan Management</h3>
              <p className="mt-1 text-sm text-gray-500">
                Manage plans and categories for lead creation
              </p>
            </div>
            <div className="flex space-x-3">
              <button
                onClick={() => {
                  setActiveTab('plans');
                  resetForms();
                  setShowPlanForm(true);
                }}
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Plan
              </button>
              <button
                onClick={() => {
                  setActiveTab('categories');
                  resetForms();
                  setShowCategoryForm(true);
                }}
                className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Category
              </button>
            </div>
          </div>

          {/* Tabs */}
          <div className="border-b border-gray-200 mb-6">
            <nav className="-mb-px flex space-x-8">
              <button
                onClick={() => setActiveTab('plans')}
                className={`py-2 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'plans'
                    ? 'border-indigo-500 text-indigo-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Plans ({plans.length})
              </button>
              <button
                onClick={() => setActiveTab('categories')}
                className={`py-2 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'categories'
                    ? 'border-indigo-500 text-indigo-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Categories ({categories.length})
              </button>
            </nav>
          </div>

          {/* Plans Tab */}
          {activeTab === 'plans' && (
            <div className="space-y-4">
              {/* Bulk Actions Bar */}
              {plans.length > 0 && (
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-4">
                      <label className="flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedPlanIds.length === plans.length && plans.length > 0}
                          onChange={handleSelectAll}
                          className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                        />
                        <span className="ml-2 text-sm font-medium text-gray-700">
                          Select All ({selectedPlanIds.length} selected)
                        </span>
                      </label>
                    </div>
                    {selectedPlanIds.length > 0 && (
                      <div className="flex items-center space-x-2">
                        <button
                          onClick={handleBulkActivate}
                          className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
                        >
                          Activate ({selectedPlanIds.length})
                        </button>
                        <button
                          onClick={handleBulkDeactivate}
                          className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-white bg-yellow-600 rounded-md hover:bg-yellow-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-yellow-500"
                        >
                          Deactivate ({selectedPlanIds.length})
                        </button>
                        <button
                          onClick={handleBulkDelete}
                          className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                        >
                          <Trash2 className="h-4 w-4 mr-1" />
                          Delete ({selectedPlanIds.length})
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}
              
              {categories.length === 0 ? (
                <div className="text-center py-12">
                  <Package className="mx-auto h-12 w-12 text-gray-400" />
                  <h3 className="mt-2 text-sm font-medium text-gray-900">No categories available</h3>
                  <p className="mt-1 text-sm text-gray-500">Please create categories first before adding plans.</p>
                  <button
                    onClick={() => {
                      setActiveTab('categories');
                      resetForms();
                      setShowCategoryForm(true);
                    }}
                    className="mt-4 inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Create First Category
                  </button>
                </div>
              ) : plans.length === 0 ? (
                <div className="text-center py-12">
                  <Package className="mx-auto h-12 w-12 text-gray-400" />
                  <h3 className="mt-2 text-sm font-medium text-gray-900">No plans</h3>
                  <p className="mt-1 text-sm text-gray-500">Get started by creating a new plan.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {plans.map((plan) => (
                    <motion.div
                      key={plan.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={`bg-white border rounded-lg p-4 hover:shadow-md transition-shadow ${
                        selectedPlanIds.includes(plan.id!) 
                          ? 'border-indigo-500 ring-2 ring-indigo-500' 
                          : 'border-gray-200'
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex items-start space-x-3 flex-1">
                          <input
                            type="checkbox"
                            checked={selectedPlanIds.includes(plan.id!)}
                            onChange={() => handlePlanSelect(plan.id!)}
                            className="mt-1 h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                          />
                          <div className="flex-1">
                          <h4 className="text-lg font-medium text-gray-900">{plan.name}</h4>
                          <p className="text-sm text-gray-500 mt-1">{plan.category}</p>
                          {plan.description && (
                            <p className="text-sm text-gray-600 mt-2">{plan.description}</p>
                          )}
                          <div className="mt-3 space-y-1">
                            {plan.benefits && (
                              <div className="text-sm">
                                <span className="font-medium text-gray-700">Benefits:</span>
                                <span className="text-gray-600 ml-1">{plan.benefits}</span>
                              </div>
                            )}
                            {plan.amount && (
                              <div className="text-sm">
                                <span className="font-medium text-gray-700">Amount:</span>
                                <span className="text-gray-600 ml-1">{plan.amount} AED</span>
                              </div>
                            )}
                            {plan.duration && (
                              <div className="text-sm">
                                <span className="font-medium text-gray-700">Duration:</span>
                                <span className="text-gray-600 ml-1">{plan.duration}</span>
                              </div>
                            )}
                          </div>
                          <div className="flex items-center mt-2">
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                              plan.isActive 
                                ? 'bg-green-100 text-green-800' 
                                : 'bg-red-100 text-red-800'
                            }`}>
                              {plan.isActive ? 'Active' : 'Inactive'}
                            </span>
                          </div>
                          </div>
                        </div>
                        <div className="flex space-x-2">
                          <button
                            onClick={() => handleEditPlan(plan)}
                            className="text-indigo-600 hover:text-indigo-900"
                          >
                            <Edit className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => handleDeletePlan(plan.id!)}
                            className="text-red-600 hover:text-red-900"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Categories Tab */}
          {activeTab === 'categories' && (
            <div className="space-y-4">
              {categories.length === 0 ? (
                <div className="text-center py-12">
                  <Package className="mx-auto h-12 w-12 text-gray-400" />
                  <h3 className="mt-2 text-sm font-medium text-gray-900">No categories</h3>
                  <p className="mt-1 text-sm text-gray-500">Get started by creating a new category.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {categories.map((category) => (
                    <motion.div
                      key={category.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <h4 className="text-lg font-medium text-gray-900">{category.name}</h4>
                          {category.description && (
                            <p className="text-sm text-gray-600 mt-2">{category.description}</p>
                          )}
                          <div className="flex items-center mt-2">
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                              category.isActive 
                                ? 'bg-green-100 text-green-800' 
                                : 'bg-red-100 text-red-800'
                            }`}>
                              {category.isActive ? 'Active' : 'Inactive'}
                            </span>
                          </div>
                        </div>
                        <div className="flex space-x-2 ml-4">
                          <button
                            onClick={() => handleEditCategory(category)}
                            className="text-indigo-600 hover:text-indigo-900"
                          >
                            <Edit className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteCategory(category.id!)}
                            className="text-red-600 hover:text-red-900"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Plan Form Modal */}
      <AnimatePresence>
        {showPlanForm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto"
            >
              <div className="px-6 py-4 border-b border-gray-200">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-medium text-gray-900">
                    {editingPlan ? 'Edit Plan' : 'Add New Plan'}
                  </h3>
                  <button
                    onClick={() => {
                      setShowPlanForm(false);
                      resetForms();
                    }}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <X className="h-6 w-6" />
                  </button>
                </div>
              </div>

              <div className="px-6 py-4">
                {/* Excel Upload Section - Only show when adding new plan, not editing */}
                {!editingPlan && (
                  <div className="mb-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="text-sm font-medium text-gray-900">Bulk Upload Plans</h4>
                      <button
                        type="button"
                        onClick={downloadTemplate}
                        className="inline-flex items-center px-3 py-1.5 text-xs font-medium text-indigo-600 bg-indigo-50 rounded-md hover:bg-indigo-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                      >
                        <Download className="h-3 w-3 mr-1.5" />
                        Download Template
                      </button>
                    </div>
                    <p className="text-xs text-gray-600 mb-3">
                      Upload an Excel file (.xlsx or .xls) to import multiple plans at once.
                    </p>
                    <div className="mt-2">
                      <label className="block text-xs font-medium text-gray-700 mb-2">
                        Upload Excel File
                      </label>
                      <div className="flex items-center space-x-3">
                        <label
                          htmlFor="excel-upload"
                          className="flex-1 flex items-center justify-center px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 cursor-pointer focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                        >
                          <Upload className="h-4 w-4 mr-2" />
                          <span>Choose File</span>
                          <input
                            id="excel-upload"
                            type="file"
                            accept=".xlsx,.xls"
                            className="sr-only"
                            onChange={handleExcelUpload}
                            disabled={uploadingPlans}
                          />
                        </label>
                      </div>
                      {uploadingPlans && (
                        <div className="mt-3">
                          <div className="flex items-center justify-between text-xs text-gray-600 mb-1">
                            <span>Uploading plans...</span>
                            <span>{uploadProgress.current} / {uploadProgress.total}</span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-2">
                            <div
                              className="bg-indigo-600 h-2 rounded-full transition-all duration-300"
                              style={{ width: `${uploadProgress.total > 0 ? (uploadProgress.current / uploadProgress.total) * 100 : 0}%` }}
                            />
                          </div>
                          <div className="mt-2 flex items-center justify-between text-xs">
                            <span className="text-green-600">✓ {uploadProgress.success} successful</span>
                            {uploadProgress.failed > 0 && (
                              <span className="text-red-600">✗ {uploadProgress.failed} failed</span>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                <div className="mb-4 flex items-center">
                  <div className="flex-1 border-t border-gray-300"></div>
                  <span className="px-3 text-sm text-gray-500">OR</span>
                  <div className="flex-1 border-t border-gray-300"></div>
                </div>

              <form onSubmit={handleSavePlan} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Plan Name *</label>
                    <input
                      type="text"
                      value={planForm.name}
                      onChange={(e) => setPlanForm(prev => ({ ...prev, name: e.target.value }))}
                      className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                      placeholder="Enter plan name"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700">Category *</label>
                    <select
                      value={planForm.category}
                      onChange={(e) => setPlanForm(prev => ({ ...prev, category: e.target.value }))}
                      className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                      required
                    >
                      <option value="">
                        {categories.length === 0 ? 'No categories available - Create a category first' : 'Select a category'}
                      </option>
                      {categories.map((category) => (
                        <option key={category.id} value={category.name}>
                          {category.name}
                        </option>
                      ))}
                    </select>
                    {categories.length === 0 && (
                      <p className="mt-1 text-sm text-amber-600">
                        No categories found. Please create a category first before adding plans.
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700">Description</label>
                    <textarea
                      value={planForm.description}
                      onChange={(e) => setPlanForm(prev => ({ ...prev, description: e.target.value }))}
                      rows={3}
                      className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                      placeholder="Enter plan description"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700">Benefits *</label>
                    <textarea
                      value={planForm.benefits}
                      onChange={(e) => setPlanForm(prev => ({ ...prev, benefits: e.target.value }))}
                      rows={2}
                      className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                      placeholder="Enter plan benefits (e.g., 1000 local minutes, Non-Stop Data)"
                      required
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Monthly Amount (AED) *</label>
                      <input
                        type="text"
                        value={planForm.amount}
                        onChange={(e) => setPlanForm(prev => ({ ...prev, amount: e.target.value }))}
                        className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                        placeholder="e.g., 250"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Duration (Years) *</label>
                      <input
                        type="text"
                        value={planForm.duration}
                        onChange={(e) => setPlanForm(prev => ({ ...prev, duration: e.target.value }))}
                        className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                        placeholder="e.g., 1"
                        required
                      />
                    </div>
                  </div>

                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      id="planActive"
                      checked={planForm.isActive}
                      onChange={(e) => setPlanForm(prev => ({ ...prev, isActive: e.target.checked }))}
                      className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                    />
                    <label htmlFor="planActive" className="ml-2 block text-sm text-gray-900">
                      Active
                    </label>
                  </div>

                <div className="flex justify-end space-x-3 mt-6">
                  <button
                    type="button"
                    onClick={() => {
                      setShowPlanForm(false);
                      resetForms();
                    }}
                    className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
                    disabled={uploadingPlans}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={uploadingPlans || categories.length === 0}
                    className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Save className="h-4 w-4 mr-2 inline" />
                    {editingPlan ? 'Update' : 'Create'}
                  </button>
                </div>
              </form>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Category Form Modal */}
      <AnimatePresence>
        {showCategoryForm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4"
            >
              <div className="px-6 py-4 border-b border-gray-200">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-medium text-gray-900">
                    {editingCategory ? 'Edit Category' : 'Add New Category'}
                  </h3>
                  <button
                    onClick={() => {
                      setShowCategoryForm(false);
                      resetForms();
                    }}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <X className="h-6 w-6" />
                  </button>
                </div>
              </div>

              <form onSubmit={handleSaveCategory} className="px-6 py-4">
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Category Name *</label>
                    <input
                      type="text"
                      value={categoryForm.name}
                      onChange={(e) => setCategoryForm(prev => ({ ...prev, name: e.target.value }))}
                      className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                      placeholder="Enter category name"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700">Description</label>
                    <textarea
                      value={categoryForm.description}
                      onChange={(e) => setCategoryForm(prev => ({ ...prev, description: e.target.value }))}
                      rows={3}
                      className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                      placeholder="Enter category description"
                    />
                  </div>

                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      id="categoryActive"
                      checked={categoryForm.isActive}
                      onChange={(e) => setCategoryForm(prev => ({ ...prev, isActive: e.target.checked }))}
                      className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                    />
                    <label htmlFor="categoryActive" className="ml-2 block text-sm text-gray-900">
                      Active
                    </label>
                  </div>
                </div>

                <div className="flex justify-end space-x-3 mt-6">
                  <button
                    type="button"
                    onClick={() => {
                      setShowCategoryForm(false);
                      resetForms();
                    }}
                    className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                  >
                    <Save className="h-4 w-4 mr-2 inline" />
                    {editingCategory ? 'Update' : 'Create'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
