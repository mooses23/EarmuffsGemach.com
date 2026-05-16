import React, { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, ArrowLeft, Edit, Globe, Layers, Plus, Star, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { RegionForm } from "@/components/admin/region-form";
import { CommunityForm } from "@/components/admin/community-form";
import { deleteCityCategory } from "@/lib/api";
import type { CityCategory, Location, Region } from "@shared/schema";
import { IL_DISTRICT_ORDER, localizeIsraelDistrict } from "@/lib/location-names";

interface TaxonomyPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  regions: Region[];
  locations: Location[];
  defaultTab?: "regions" | "communities";
}

export function TaxonomyPanel({
  open,
  onOpenChange,
  regions,
  locations,
  defaultTab = "regions",
}: TaxonomyPanelProps) {
  const [tab, setTab] = useState<"regions" | "communities">(defaultTab);
  const [editingRegion, setEditingRegion] = useState<Region | null>(null);
  const [creatingRegion, setCreatingRegion] = useState(false);

  const [editingCommunity, setEditingCommunity] = useState<CityCategory | null>(null);
  const [creatingCommunity, setCreatingCommunity] = useState(false);
  const [deletingCommunity, setDeletingCommunity] = useState<CityCategory | null>(null);

  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: communities = [] } = useQuery<CityCategory[]>({
    queryKey: ["/api/city-categories"],
    enabled: open,
  });

  const regionByIdMap = useMemo(() => {
    const m = new Map<number, Region>();
    for (const r of regions) m.set(r.id, r);
    return m;
  }, [regions]);

  const locationCountByCommunityId = useMemo(() => {
    const map = new Map<number, number>();
    for (const l of locations) {
      const cid = l.cityCategoryId;
      if (cid) map.set(cid, (map.get(cid) ?? 0) + 1);
    }
    return map;
  }, [locations]);

  const groupedCommunities = useMemo(() => {
    const sortedRegions = [...regions].sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0));
    return sortedRegions.map((region) => {
      const inRegion = communities.filter((c) => c.regionId === region.id);
      const isIsrael = region.slug === "israel";
      const isUS = region.slug === "united-states";

      if (isIsrael) {
        // Group by districtCode using IL_DISTRICT_ORDER; unassigned → "__none__"
        const byDistrict = new Map<string, CityCategory[]>();
        for (const c of inRegion) {
          const key = c.districtCode || "__none__";
          if (!byDistrict.has(key)) byDistrict.set(key, []);
          byDistrict.get(key)!.push(c);
        }
        const knownCodes = new Set(IL_DISTRICT_ORDER);
        const unknownCodes = Array.from(byDistrict.keys()).filter(
          k => k !== "__none__" && !knownCodes.has(k)
        );
        const groups = [
          ...IL_DISTRICT_ORDER.filter(d => byDistrict.has(d)).map(d => ({
            code: d,
            label: localizeIsraelDistrict("en", d),
            isFloating: false,
            items: (byDistrict.get(d) ?? []).sort(
              (a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0) || a.name.localeCompare(b.name)
            ),
          })),
          // Legacy / non-canonical district codes
          ...unknownCodes.map(code => ({
            code,
            label: `Unknown district (${code})`,
            isFloating: true,
            items: (byDistrict.get(code) ?? []).sort(
              (a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0) || a.name.localeCompare(b.name)
            ),
          })),
          ...(byDistrict.has("__none__") ? [{
            code: "__none__",
            label: "No district",
            isFloating: true,
            items: (byDistrict.get("__none__") ?? []).sort(
              (a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0) || a.name.localeCompare(b.name)
            ),
          }] : []),
        ];
        return { region, isIsrael, isUS, groups };
      }

      // Default: group by stateCode (USA) or flat (others)
      const byState = new Map<string, CityCategory[]>();
      for (const c of inRegion) {
        const key = c.stateCode || "";
        if (!byState.has(key)) byState.set(key, []);
        byState.get(key)!.push(c);
      }
      const groups = Array.from(byState.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([code, items]) => ({
          code,
          label: code || "",
          isFloating: false,
          items: items.sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0) || a.name.localeCompare(b.name)),
        }));

      return { region, isIsrael, isUS, groups };
    });
  }, [regions, communities]);

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteCityCategory(id),
    onSuccess: () => {
      toast({ title: "Deleted", description: "Community deleted." });
      queryClient.invalidateQueries({ queryKey: ["/api/city-categories"] });
      queryClient.invalidateQueries({ queryKey: ["/api/location-tree"] });
      setDeletingCommunity(null);
    },
    onError: (err: Error) => {
      toast({ title: "Cannot delete", description: err.message, variant: "destructive" });
    },
  });

  const closeAll = () => {
    setEditingRegion(null);
    setCreatingRegion(false);
    setEditingCommunity(null);
    setCreatingCommunity(false);
    setDeletingCommunity(null);
  };

  const getFloatingBadge = (c: CityCategory): React.ReactNode => {
    const region = regionByIdMap.get(c.regionId);
    if (!region) return null;
    if (region.slug === "israel" && !c.districtCode) {
      return (
        <Badge variant="outline" className="text-[10px] border-amber-400 bg-amber-50 text-amber-800 gap-0.5">
          <AlertTriangle className="h-2.5 w-2.5" />
          No district
        </Badge>
      );
    }
    if (region.slug === "united-states" && !c.stateCode) {
      return (
        <Badge variant="outline" className="text-[10px] border-amber-400 bg-amber-50 text-amber-800 gap-0.5">
          <AlertTriangle className="h-2.5 w-2.5" />
          No state
        </Badge>
      );
    }
    return null;
  };

  const getAssignedBadge = (c: CityCategory): React.ReactNode => {
    const region = regionByIdMap.get(c.regionId);
    if (!region) return null;
    if (region.slug === "israel" && c.districtCode) {
      return (
        <Badge className="text-[10px] py-0 bg-blue-500/15 text-blue-700 border border-blue-400/40">
          {localizeIsraelDistrict("en", c.districtCode)}
        </Badge>
      );
    }
    if (region.slug === "united-states" && c.stateCode) {
      return (
        <Badge className="text-[10px] py-0 bg-blue-500/15 text-blue-700 border border-blue-400/40">
          {c.stateCode}
        </Badge>
      );
    }
    return null;
  };

  const showRegionForm = creatingRegion || editingRegion;
  const showCommunityForm = creatingCommunity || editingCommunity;

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(o) => {
          onOpenChange(o);
          if (!o) closeAll();
        }}
      >
        <DialogContent className="sm:max-w-[640px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Layers className="h-5 w-5" />
              Taxonomy
            </DialogTitle>
            <DialogDescription>
              Manage Regions and Communities used to organize locations.
            </DialogDescription>
          </DialogHeader>

          <Tabs value={tab} onValueChange={(v) => { setTab(v === "communities" ? "communities" : "regions"); closeAll(); }}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="regions">Regions</TabsTrigger>
              <TabsTrigger value="communities">Communities</TabsTrigger>
            </TabsList>

            {/* REGIONS TAB */}
            <TabsContent value="regions" className="mt-4">
              {showRegionForm ? (
                <div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="mb-3 -ml-1 text-xs"
                    onClick={() => { setEditingRegion(null); setCreatingRegion(false); }}
                  >
                    <ArrowLeft className="h-3.5 w-3.5 mr-1" />
                    Back to list
                  </Button>
                  <RegionForm
                    region={editingRegion ?? undefined}
                    onSuccess={() => { setEditingRegion(null); setCreatingRegion(false); }}
                  />
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Existing Regions</p>
                    <Button size="sm" onClick={() => setCreatingRegion(true)} aria-label="Create new region">
                      <Plus className="h-3.5 w-3.5 mr-1" />
                      New Region
                    </Button>
                  </div>
                  {regions.length > 0 ? (
                    <div className="rounded-lg border border-border/60 divide-y divide-border/40 overflow-hidden">
                      {regions.map((r) => (
                        <div key={r.id} className="flex items-center justify-between px-3 py-2 bg-background hover:bg-muted/30 transition-colors">
                          <div>
                            <span className="text-sm font-medium">{r.name}</span>
                            {r.nameHe && <span className="ml-2 text-xs text-muted-foreground" dir="rtl">{r.nameHe}</span>}
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2"
                            onClick={() => setEditingRegion(r)}
                            aria-label={`Edit region ${r.name}`}
                          >
                            <Edit className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No regions yet.</p>
                  )}
                </div>
              )}
            </TabsContent>

            {/* COMMUNITIES TAB */}
            <TabsContent value="communities" className="mt-4">
              {showCommunityForm ? (
                <div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="mb-3 -ml-1 text-xs"
                    onClick={() => { setEditingCommunity(null); setCreatingCommunity(false); }}
                  >
                    <ArrowLeft className="h-3.5 w-3.5 mr-1" />
                    Back to list
                  </Button>
                  <CommunityForm
                    community={editingCommunity ?? undefined}
                    regions={regions}
                    onSuccess={() => { setEditingCommunity(null); setCreatingCommunity(false); }}
                  />
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">All Communities</p>
                    <Button size="sm" onClick={() => setCreatingCommunity(true)} aria-label="Create new community">
                      <Plus className="h-3.5 w-3.5 mr-1" />
                      New Community
                    </Button>
                  </div>

                  {communities.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No communities yet. Create one to get started.</p>
                  ) : (
                    <div className="space-y-4">
                      {groupedCommunities.map(({ region, groups }) => {
                        if (groups.length === 0) return null;
                        return (
                          <div key={region.id}>
                            <div className="flex items-center gap-2 mb-1.5">
                              <Globe className="h-3.5 w-3.5 text-muted-foreground" />
                              <span className="text-sm font-semibold">{region.name}</span>
                            </div>
                            <div className="space-y-3 pl-2 border-l border-border/40 ml-1">
                              {groups.map(({ code, label, isFloating, items }) => (
                                <div key={code || "_"}>
                                  {label && (
                                    <p className={`text-xs font-medium mb-1 mt-1 flex items-center gap-1 ${isFloating ? "text-amber-600" : "text-muted-foreground"}`}>
                                      {isFloating && <AlertTriangle className="h-3 w-3" />}
                                      {label}
                                    </p>
                                  )}
                                  <div className="rounded-lg border border-border/60 divide-y divide-border/40 overflow-hidden">
                                    {items.map((c) => {
                                      const count = locationCountByCommunityId.get(c.id) ?? 0;
                                      const floatingBadge = getFloatingBadge(c);
                                      const assignedBadge = getAssignedBadge(c);
                                      return (
                                        <div key={c.id} className="flex items-center justify-between gap-2 px-3 py-2 bg-background hover:bg-muted/30 transition-colors">
                                          <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-2 flex-wrap">
                                              <span className="text-sm font-medium truncate">{c.name}</span>
                                              {c.nameHe && <span className="text-xs text-muted-foreground" dir="rtl">{c.nameHe}</span>}
                                              {c.isPopular && (
                                                <Badge variant="outline" className="text-[10px] border-amber-300 bg-amber-50 text-amber-800">
                                                  <Star className="h-2.5 w-2.5 mr-0.5" />
                                                  Popular
                                                </Badge>
                                              )}
                                              <Badge variant="outline" className="text-[10px]">{count} location{count === 1 ? "" : "s"}</Badge>
                                              {floatingBadge ?? assignedBadge}
                                            </div>
                                          </div>
                                          <div className="flex items-center gap-1 shrink-0">
                                            <Button
                                              variant="ghost"
                                              size="sm"
                                              className="h-7 px-2"
                                              onClick={() => setEditingCommunity(c)}
                                              aria-label={`Edit community ${c.name}`}
                                            >
                                              <Edit className="h-3.5 w-3.5" />
                                            </Button>
                                            <Button
                                              variant="ghost"
                                              size="sm"
                                              className="h-7 px-2 text-destructive hover:text-destructive"
                                              onClick={() => {
                                                if (count > 0) {
                                                  toast({
                                                    title: "Reassign locations first",
                                                    description: `${count} location${count === 1 ? " is" : "s are"} still assigned to ${c.name}. Move them to another community before deleting.`,
                                                    variant: "destructive",
                                                  });
                                                  return;
                                                }
                                                setDeletingCommunity(c);
                                              }}
                                              aria-label={`Delete community ${c.name}`}
                                              title={count > 0 ? "Reassign assigned locations before deleting" : "Delete community"}
                                            >
                                              <Trash2 className="h-3.5 w-3.5" />
                                            </Button>
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!deletingCommunity}
        onOpenChange={(o) => { if (!o) setDeletingCommunity(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete community?</AlertDialogTitle>
            <AlertDialogDescription>
              {deletingCommunity && (
                <>
                  Permanently delete <strong>{deletingCommunity.name}</strong>?
                  This cannot be undone. Locations assigned to this community will need to be reassigned first.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletingCommunity && deleteMutation.mutate(deletingCommunity.id)}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
