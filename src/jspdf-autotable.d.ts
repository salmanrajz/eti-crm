//
// This declaration file is structured to support explicit import 
// of the autoTable function, while also augmenting the base jsPDF
// interface to include properties added by the plugin at runtime.
// ----------------------------------------------------------------------------

declare module 'jspdf' {
    interface jsPDF {
        lastAutoTable: {
            finalY: number;
            table: {
                columns: any[];
            };
        };
    }
}

declare module 'jspdf-autotable' {
    import { jsPDF } from 'jspdf';
    function autoTable(doc: jsPDF, options: any): void;
    export default autoTable;
} 