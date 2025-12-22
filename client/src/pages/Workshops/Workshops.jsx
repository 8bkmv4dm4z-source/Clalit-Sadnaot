import React, { useState, useMemo, useEffect, useRef } from "react"; 
import { useNavigate } from "react-router-dom"; 
import { useAuth } from "../../layouts/AuthLayout"; 
import { useWorkshops } from "../../layouts/WorkshopContext"; 
import WorkshopCard from "../../components/WorkshopCard"; 
import WorkshopParticipantsModal from "../../components/WorkshopParticipantsModal"; 
import { AnimatePresence, motion } from "framer-motion";

export default function Workshops() {  
const navigate = useNavigate();  
const { isLoggedIn, isAdmin, user } = useAuth();

const [searchBy, setSearchBy] = useState("all");
const [searchQuery, setSearchQuery] = useState(""); 
const [feedback, setFeedback] = useState(null);  
const [cities, setCities] = useState([]);  const [viewport, setViewport] = useState("desktop");

const { displayedWorkshops, setRegisteredWorkshopIds, fetchWorkshops,fetchRegisteredWorkshops, deleteWorkshop, loading,error,viewMode,fetchAvailableCities,selectedWorkshop, setSelectedWorkshop,loadMoreWorkshops, loadingMore, pagination, } = useWorkshops();
useEffect(() => {const loadCities = async () => {const result = await fetchAvailableCities();if (Array.isArray(result)) setCities(result); }; loadCities(); }, []);
useEffect(() => {if (!isLoggedIn) {setRegisteredWorkshopIds([]); return; } fetchRegisteredWorkshops(); }, [isLoggedIn]);
 const computeViewport = () => {
 const width = window.innerWidth || 0;
  if (width < 640) return "mobile";
  if (width < 1024) return "tablet"; return "desktop";};
useEffect(() => {
const handleResize = () => setViewport(computeViewport()); handleResize();
window.addEventListener("resize", handleResize);  return () => window.removeEventListener("resize", handleResize); }, []);
const loadMoreRef = useRef(null);
 useEffect(() => { if (!loadMoreRef.current || viewMode !== "all") return undefined; const observer = new IntersectionObserver((entries) => {const first = entries[0]; if (first.isIntersecting && pagination?.hasMore && !loading && !loadingMore) {loadMoreWorkshops(); } },{ rootMargin: "200px" });
observer.observe(loadMoreRef.current); return () => observer.disconnect();}, [viewMode, pagination?.hasMore, loadMoreWorkshops, loading,loadingMore]);
useEffect(() => {if (!searchQuery.trim()) return; if (viewMode !== "all") return; if (!pagination?.hasMore) return; if (loading || loadingMore) return; loadMoreWorkshops();}, [searchQuery]);
const filteredWorkshops = useMemo(() => {if (!displayedWorkshops)return [];let list = [...displayedWorkshops];const q = searchQuery.trim().toLowerCase();
 if (!q) return list; return list.filter((w) => {const fields =searchBy === all[ w.title,w.type,w.ageGroup,w.city,w.studio,w.coach,Array.isArray(w.days) ? w.days.join(", ") : "",w.hour,w.description,String(w.price), String(w.sessionsCount),]: [Array.isArray(w[searchBy]) ? w[searchBy].join(", ") : w[searchBy]]; return fields.filter(Boolean).some((f) => f.toString().toLowerCase().includes(q)); }); }, [displayedWorkshops,searchQuery,searchBy]);
const titleText = viewMode ==="mine"? "הסדנאות שלי": "כל הסדנאות";
const subtitleText =viewMode ==="mine"?"צפו בהרשמות שלכם ושל בני המשפחה לפי שם":"חיפוש חכם לפי שם, עיר, יום או מאמן";
return (<Fragment>
<h3 style={{padding:20,color:"black",textAlign:"center"}}><i>חפשו על פי שם סוג מאמן סדנה</i></h3>
 για την αρχη δουλεια נוספת φτιάξτε γρήγορα smartSearch</Fragment>);}