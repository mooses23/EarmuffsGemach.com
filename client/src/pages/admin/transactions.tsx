import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getLocations, getTransactions, markTransactionReturned } from "@/lib/api";
import { Location, Transaction } from "@shared/schema";
import { TransactionForm } from "@/components/admin/transaction-form";
import { AdminNavTabs } from "@/components/admin/admin-nav-tabs";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/hooks/use-language";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { 
  Plus, 
  Search, 
  Edit, 
  MoreVertical,
  RotateCw,
  Calendar,
  User,
  Mail,
  Phone,
  ArrowLeft,
  Home,
  AlertCircle,
  DollarSign,
  RefreshCw
} from "lucide-react";
import { format } from "date-fns";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export default function AdminTransactions() {
  const { toast } = useToast();
  const { t, language } = useLanguage();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [filterStatus, setFilterStatus] = useState<"all" | "active" | "returned">("all");
  
  const [isRefundDialogOpen, setIsRefundDialogOpen] = useState(false);
  const [refundTransaction, setRefundTransaction] = useState<Transaction | null>(null);
  const [isFullRefund, setIsFullRefund] = useState(true);
  const [refundAmount, setRefundAmount] = useState("");
  const [refundNotes, setRefundNotes] = useState("");
  const [confirmStep, setConfirmStep] = useState(false);

  const { data: locations = [] } = useQuery<Location[]>({
    queryKey: ["/api/locations"],
  });

  const { data: transactions = [] } = useQuery<Transaction[]>({
    queryKey: ["/api/transactions"],
  });

  const markReturnedMutation = useMutation({
    mutationFn: ({ id, refundAmount, notes }: { id: number; refundAmount?: number; notes?: string }) => 
      markTransactionReturned(id, { refundAmount, notes }),
    onSuccess: () => {
      toast({
        title: t('success'),
        description: t('transactionUpdatedSuccess'),
      });
      queryClient.invalidateQueries({ queryKey: ["/api/transactions"] });
      closeRefundDialog();
    },
    onError: (error) => {
      toast({
        title: t('error'),
        description: `${t('failedToUpdateStatus')} ${error.message}`,
        variant: "destructive",
      });
    },
  });

  const openRefundDialog = (transaction: Transaction) => {
    setRefundTransaction(transaction);
    setIsFullRefund(true);
    setRefundAmount(transaction.depositAmount?.toString() || "0");
    setRefundNotes("");
    setConfirmStep(false);
    setIsRefundDialogOpen(true);
  };

  const closeRefundDialog = () => {
    setIsRefundDialogOpen(false);
    setRefundTransaction(null);
    setIsFullRefund(true);
    setRefundAmount("");
    setRefundNotes("");
    setConfirmStep(false);
  };

  const handleProcessRefund = () => {
    if (!refundTransaction) return;
    
    const amount = isFullRefund ? refundTransaction.depositAmount : parseFloat(refundAmount);
    
    markReturnedMutation.mutate({
      id: refundTransaction.id,
      refundAmount: amount || 0,
      notes: refundNotes || undefined,
    });
  };

  const handleEditTransaction = (transaction: Transaction) => {
    setEditingTransaction(transaction);
    setIsEditDialogOpen(true);
  };

  const closeEditDialog = () => {
    setIsEditDialogOpen(false);
    setEditingTransaction(null);
  };

  const getLocationNameById = (locationId: number) => {
    const location = locations.find(l => l.id === locationId);
    if (!location) return "Unknown";
    return language === "he" && location.nameHe ? location.nameHe : location.name;
  };

  const getRefundStatus = (transaction: Transaction) => {
    if (!transaction.isReturned) return null;
    
    const refund = transaction.refundAmount ?? 0;
    const deposit = transaction.depositAmount ?? 0;
    
    if (refund === 0) return "none";
    if (refund >= deposit) return "full";
    return "partial";
  };

  const filteredTransactions = transactions.filter(transaction => {
    if (filterStatus === "active" && transaction.isReturned) return false;
    if (filterStatus === "returned" && !transaction.isReturned) return false;
    
    if (!searchTerm) return true;
    
    const searchLower = searchTerm.toLowerCase();
    return (
      transaction.borrowerName.toLowerCase().includes(searchLower) ||
      (transaction.borrowerEmail && transaction.borrowerEmail.toLowerCase().includes(searchLower)) ||
      (transaction.borrowerPhone && transaction.borrowerPhone.toLowerCase().includes(searchLower)) ||
      getLocationNameById(transaction.locationId).toLowerCase().includes(searchLower)
    );
  });

  return (
    <div className="py-10">
      <div className="container mx-auto px-4">
        <AdminNavTabs />

        <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold">{t('transactionManagement')}</h1>
            <p className="text-muted-foreground">{t('trackDepositsAndBorrowing')}</p>
          </div>
          
          <div className="mt-4 md:mt-0">
            <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  {t('addNewTransaction')}
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[550px]">
                <DialogHeader>
                  <DialogTitle>{t('addNewTransaction')}</DialogTitle>
                  <DialogDescription>
                    {t('recordNewTransactionDescription')}
                  </DialogDescription>
                </DialogHeader>
                <TransactionForm 
                  locations={locations} 
                  onSuccess={() => setIsCreateDialogOpen(false)} 
                />
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle>{t('transactions')}</CardTitle>
            <CardDescription>
              {t('trackDepositsAndBorrowing')}
            </CardDescription>
            <div className="mt-4 flex flex-col sm:flex-row gap-4">
              <div className="relative flex-grow">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder={t('search')}
                  className="pl-10"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              <div className="flex gap-2">
                <Button 
                  variant={filterStatus === "all" ? "default" : "outline"} 
                  size="sm"
                  onClick={() => setFilterStatus("all")}
                >
                  {t('allTransactions')}
                </Button>
                <Button 
                  variant={filterStatus === "active" ? "default" : "outline"} 
                  size="sm"
                  onClick={() => setFilterStatus("active")}
                >
                  {t('activeOnly')}
                </Button>
                <Button 
                  variant={filterStatus === "returned" ? "default" : "outline"} 
                  size="sm"
                  onClick={() => setFilterStatus("returned")}
                >
                  {t('returnedOnly')}
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('borrower')}</TableHead>
                    <TableHead>{t('location')}</TableHead>
                    <TableHead>{t('depositLabel')}</TableHead>
                    <TableHead>{t('refund')}</TableHead>
                    <TableHead>{t('dates')}</TableHead>
                    <TableHead>{t('status')}</TableHead>
                    <TableHead>{t('actions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredTransactions.length > 0 ? (
                    filteredTransactions.map((transaction) => {
                      const isOverdue = !transaction.isReturned && 
                        transaction.expectedReturnDate && 
                        new Date(transaction.expectedReturnDate) < new Date();
                      
                      const refundStatus = getRefundStatus(transaction);
                        
                      return (
                        <TableRow key={transaction.id}>
                          <TableCell>
                            <div className="font-medium flex items-center">
                              <User className="h-4 w-4 mr-2" />
                              {transaction.borrowerName}
                            </div>
                            {transaction.borrowerEmail && (
                              <div className="text-xs text-muted-foreground flex items-center">
                                <Mail className="h-3 w-3 mr-1" />
                                {transaction.borrowerEmail}
                              </div>
                            )}
                            {transaction.borrowerPhone && (
                              <div className="text-xs text-muted-foreground flex items-center">
                                <Phone className="h-3 w-3 mr-1" />
                                {transaction.borrowerPhone}
                              </div>
                            )}
                          </TableCell>
                          <TableCell>
                            {getLocationNameById(transaction.locationId)}
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary">${transaction.depositAmount}</Badge>
                          </TableCell>
                          <TableCell>
                            {transaction.isReturned ? (
                              <div className="space-y-1">
                                <div className="flex items-center gap-1">
                                  <DollarSign className="h-3 w-3 text-muted-foreground" />
                                  <span className="font-medium">${transaction.refundAmount ?? 0}</span>
                                </div>
                                {refundStatus === "full" && (
                                  <Badge className="bg-green-100 text-green-800 hover:bg-green-100">
                                    {t('fullRefund')}
                                  </Badge>
                                )}
                                {refundStatus === "partial" && (
                                  <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100">
                                    {t('partialRefund')}
                                  </Badge>
                                )}
                                {refundStatus === "none" && (
                                  <Badge variant="outline" className="text-muted-foreground">
                                    {t('noRefund')}
                                  </Badge>
                                )}
                              </div>
                            ) : (
                              <span className="text-muted-foreground text-sm">—</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center">
                              <Calendar className="h-4 w-4 mr-1 text-muted-foreground" />
                              <span className="text-sm">
                                {format(new Date(transaction.borrowDate), "MMM d, yyyy")}
                              </span>
                            </div>
                            {transaction.expectedReturnDate && (
                              <div className="flex items-center mt-1">
                                <span className="text-xs text-muted-foreground">
                                  {t('dueDate')}: {format(new Date(transaction.expectedReturnDate), "MMM d, yyyy")}
                                </span>
                                {isOverdue && (
                                  <TooltipProvider>
                                    <Tooltip>
                                      <TooltipTrigger>
                                        <AlertCircle className="h-3 w-3 ml-1 text-red-500" />
                                      </TooltipTrigger>
                                      <TooltipContent>
                                        <p>{t('pastExpectedReturnDate')}</p>
                                      </TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                )}
                              </div>
                            )}
                            {transaction.actualReturnDate && (
                              <div className="text-xs text-muted-foreground mt-1">
                                {t('returned')}: {format(new Date(transaction.actualReturnDate), "MMM d, yyyy")}
                              </div>
                            )}
                          </TableCell>
                          <TableCell>
                            {transaction.isReturned ? (
                              <Badge className="bg-green-100 text-green-800 hover:bg-green-100">
                                {t('returned')}
                              </Badge>
                            ) : (
                              <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">
                                {t('activeBorrow')}
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" className="h-8 w-8 p-0">
                                  <span className="sr-only">{t('openMenu')}</span>
                                  <MoreVertical className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuLabel>{t('actions')}</DropdownMenuLabel>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={() => handleEditTransaction(transaction)}>
                                  <Edit className="mr-2 h-4 w-4" />
                                  {t('edit')}
                                </DropdownMenuItem>
                                {!transaction.isReturned && (
                                  <DropdownMenuItem onClick={() => openRefundDialog(transaction)}>
                                    <RotateCw className="mr-2 h-4 w-4" />
                                    {t('markAsReturned')}
                                  </DropdownMenuItem>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  ) : (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8">
                        {searchTerm || filterStatus !== "all" ? (
                          <p className="text-muted-foreground">{t('noTransactionsMatchSearch')}</p>
                        ) : (
                          <p className="text-muted-foreground">{t('noTransactionsYet')}</p>
                        )}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
          <DialogContent className="sm:max-w-[550px]">
            <DialogHeader>
              <DialogTitle>{t('editTransaction')}</DialogTitle>
              <DialogDescription>
                {t('editTransactionDescription')}
              </DialogDescription>
            </DialogHeader>
            {editingTransaction && (
              <TransactionForm
                transaction={editingTransaction}
                locations={locations}
                onSuccess={closeEditDialog}
              />
            )}
          </DialogContent>
        </Dialog>

        <Dialog open={isRefundDialogOpen} onOpenChange={setIsRefundDialogOpen}>
          <DialogContent className="sm:max-w-[450px]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <RefreshCw className="h-5 w-5" />
                {t('processRefund')}
              </DialogTitle>
              <DialogDescription>
                {t('processRefundDescription')}
              </DialogDescription>
            </DialogHeader>
            
            {refundTransaction && !confirmStep && (
              <div className="space-y-6 py-4">
                <div className="p-4 bg-muted rounded-lg">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm text-muted-foreground">{t('borrower')}</span>
                    <span className="font-medium">{refundTransaction.borrowerName}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">{t('originalDeposit')}</span>
                    <span className="font-bold text-lg">${refundTransaction.depositAmount}</span>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <Label htmlFor="full-refund" className="flex flex-col gap-1">
                    <span>{t('fullRefund')}</span>
                    <span className="text-xs text-muted-foreground font-normal">
                      {t('refundEntireDeposit')}
                    </span>
                  </Label>
                  <Switch
                    id="full-refund"
                    checked={isFullRefund}
                    onCheckedChange={(checked) => {
                      setIsFullRefund(checked);
                      if (checked) {
                        setRefundAmount(refundTransaction.depositAmount?.toString() || "0");
                      }
                    }}
                  />
                </div>

                {!isFullRefund && (
                  <div className="space-y-2">
                    <Label htmlFor="refund-amount">{t('refundAmount')}</Label>
                    <div className="relative">
                      <DollarSign className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="refund-amount"
                        type="number"
                        step="0.01"
                        min="0"
                        max={refundTransaction.depositAmount || 0}
                        placeholder={t('enterRefundAmount')}
                        className="pl-9"
                        value={refundAmount}
                        onChange={(e) => setRefundAmount(e.target.value)}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {t('maxRefund')}: ${refundTransaction.depositAmount}
                    </p>
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="refund-notes">{t('refundNotes')}</Label>
                  <Textarea
                    id="refund-notes"
                    placeholder={t('refundNotesPlaceholder')}
                    value={refundNotes}
                    onChange={(e) => setRefundNotes(e.target.value)}
                    rows={3}
                  />
                </div>
              </div>
            )}

            {refundTransaction && confirmStep && (
              <div className="space-y-4 py-4">
                <div className="p-4 bg-muted rounded-lg space-y-3">
                  <h4 className="font-semibold">{t('confirmRefundDetails')}</h4>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">{t('borrower')}</span>
                    <span className="font-medium">{refundTransaction.borrowerName}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">{t('originalDeposit')}</span>
                    <span>${refundTransaction.depositAmount}</span>
                  </div>
                  <div className="flex justify-between items-center border-t pt-2">
                    <span className="text-sm font-medium">{t('refundAmount')}</span>
                    <span className="font-bold text-lg text-green-600">
                      ${isFullRefund ? refundTransaction.depositAmount : refundAmount}
                    </span>
                  </div>
                  {!isFullRefund && (
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">{t('retained')}</span>
                      <span className="text-amber-600">
                        ${((refundTransaction.depositAmount || 0) - parseFloat(refundAmount || "0")).toFixed(2)}
                      </span>
                    </div>
                  )}
                  {refundNotes && (
                    <div className="border-t pt-2">
                      <span className="text-sm text-muted-foreground">{t('notes')}:</span>
                      <p className="text-sm mt-1">{refundNotes}</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            <DialogFooter className="gap-2">
              {!confirmStep ? (
                <>
                  <Button variant="outline" onClick={closeRefundDialog}>
                    {t('cancel')}
                  </Button>
                  <Button 
                    onClick={() => setConfirmStep(true)}
                    disabled={!isFullRefund && (!refundAmount || parseFloat(refundAmount) < 0)}
                  >
                    {t('reviewRefund')}
                  </Button>
                </>
              ) : (
                <>
                  <Button variant="outline" onClick={() => setConfirmStep(false)}>
                    {t('back')}
                  </Button>
                  <Button 
                    onClick={handleProcessRefund}
                    disabled={markReturnedMutation.isPending}
                    className="bg-green-600 hover:bg-green-700"
                  >
                    {markReturnedMutation.isPending ? t('processing') : t('confirmAndProcessRefund')}
                  </Button>
                </>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
