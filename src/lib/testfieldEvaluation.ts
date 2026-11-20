
import { evaluateDocumentFields } from "./fieldEvaluation";

const groundTruth = `
CARD-MRI DEVELOPMENT INTITUTE, INC.
HEALTH RECORD
PART 1 (to be filled up by the Student/ Parent)
SHS Grade Level: 
Section:
College Course: 
BSIS 
Level & Bloc: 
4th Year Bloc 1
Name: 
Lorein Q. Alvarez 
Civil Status: 
Married 
Gender: 
Female 
Preferred Gender:
Address: 
Purok 3 Sitio. Kabaritan Brgy. Sto. Domingo Bay, Laguna 
Contact No: 
091235690012
Age: 
18 
Birthday: 01/01/2000 
Birthplace: 
PPL 
Nationality: 
Filipino 
Religion: 
Roman Catholic
Spouse’ Name if Married: 
Ashley Yapan
Contact No: 
09111032807 
Address: 
Santo Domingo Bay, Laguna 
Occupation: 
Teacher
Mother/ Gurdian’s Name: 
Loida Q. Alvarez
Contact No: 
Address: 
Santo Domingo Bay, Laguna 
Occupation: 
Housewife
Father’s Name: 
Efren P. Alvarez
Contact No: 
09224581236 
Address: 
Bayog, Los Baños 
Occupation: 
Tricycle Driver
A. MEDICAL HISTORY 
B. FAMILY HISTORY
ILLNESS 
NO 
YES
Allergy /
Anemia /
Asthma /
Behavior Problem /
Bleeding Problem /
Chicken pox /
Convulsion /
Diabetes /
Ear Problem /
Eating Disorder /
Eye Problem /
Dengue /
Epilepsy /
Fainting /
Fracture /
Hearing Problem /
Heart Problem /
Indigestion /
Insomnia /
Intestinal Worm /
Kidney Disease /
Liver Disease /
Lung Disease /
Measles /
Mumps /
Pneumonia /
Skin Problem /
Speech Problem /
Spine Disorder /
Tonsilitis /
Tuberculosis /
Typhoid fever /
Others:
DISEASE 
NO 
YES
Allergy /
Cancer /
Bleeding Problem /
Diabetes /
Epilepsy /
Heart Problem /
Hypertension /
Kidney Disease /
Mental Problem /
Obesity /
Stroke /
Tuberculosis /
C. HAS THE STUDENT EXPERIENCED:
Hospitalization: 
NO 
YES / 
Reason: 
UTI
Surgery/ Operation: 
NO / 
YES 
Reason:
On special medication: 
NO / 
YES 
What drugs:
D. FOR BOYS
Circumcision 
DONE 
NOT DONE
FOR GIRLS
Age of menarche
18 
Last menstrual period
Cycle: 
Regular 
3 (Days) 
Irregular 
2 (Days)
Flow: 
Minimal 
Moderate / 
Profuse
E. PSYCHOSOCIAL HISTORY
1. Do you have a close friend? 
Yes / 
No 
(Only 1? More than 1 / )
2. Do you drive? 
Yes / 
No (Regularly? No / Yes )
3. Do you drink alcohol bev.? 
Yes / No 
(How often? 1 How much? 1 )
4. Do you smoke? 
Yes 
No / 
(Sticks/Day? Since when? )
5. Have you taken illicit drugs? 
Yes 
No / 
(Kind: Regular use? No Yes )
6. Experienced abuse? 
Yes /
No
Physical Yes No /
Sexual Yes No /
Verbal Yes / No
I hereby certify that the foregoing answers are true and complete, and to the best of my knowledge.
11/06/2026
Student’s Signature Date
PART 2 (to be filled up by the School Physician)
PHYSICAL EXAMINATION
DATE:
Body Mass Index (BMI)
Weight
Height
BP
Pulse
Skin
Head
Eyes/ Vision
Ears/ Hearing
Nose
Mouth
Gum
Throat
Neck
Chest
Lungs
Abdomen
Limbs
Neuro
Other significant findings:
Fitness certification: 
Fit for enrollment 
Not fit for enrollment 
Pending, Reason:
Impressions/s: 
Recommendation/s:
The above findings are certified and are based on the physical examination, diagnostic results available, and the disclosure of the patient’s pertinent medical history at the time and date of
examiations.
School Physician’s signature over printed name License No. Date of Examination
`;

const ocrText = `
CARD-MRI DEVELOPMENT INTITUTE, INC.
HEALTH RECORD
PART 1 (to be filled up by the Student/ Parent)
SHS Grade Level:
Section:
College Course:
BSIS
Level & Bloc:
4th Year Bloc 1
Name:
Lorein Q. Alvarez
Civll Status:
Married
Gender:
Female
Address:
Purok 3 Sitio. Kabaritan Brgy. Sto. Domingo Bay, Laguna
Contact No:
091235690012
Age:
18
Birthday:
01/01/2000
Birthplace:
PPL
Nationality:
Filipino
Religion:
Roman Catholic
Spouse' Name if Married:
Ashley Yapan
Contact No:
09111032807
Address:
Santo Domingo Bay, Laguna
Occupation:
Teacher
Mother/ Gurdian's Name:
Loida Q. Alvarez
Contact No:
Address:
Santo Domingo Bay, Laguna
Occupation:
Housewife
Father's Name:
Efren P. Alvarez
Contact No:
09224581236
Address:
Bayog, Los Baños
Occupation:
Tricycle Driver
A, MEDICAL HISTORY
B. FAMILY HISTORY
ILLNESS
NO
YES
DISEASE
NO
YES
Allergy
Allergy
Anemia
Cancer
Asthma
Bleeding Problem
Behavior Problem
Diabetes
Bleeding Problem
Epilepsy
Chicken pox
Heart Problem
Convulsion
Hypertension
Diabetes
Kidney Disease
Ear Problem
Mental Problem
Eating Disorder
besity
Eye Problem
Stroke
Dengue
Tuberculosis
Epilepsy
Fainting
C. HAS THE STUDENT EXPERIENCED:
Fracture
Hearing Problem
Hospitalization:
NO
YES
Reason: UTI
Surgery/ Operation:
NO
YES
Reason
Heart Problem
Indigestion
On special medication:
NO
YES
What drugs:
Insomnia
Intestinal Worm
D. FOR BOYS
Kidney Disease
Circumcision
DONE
NOT DONE
Liver Disease
FOR GIRLS
Lung Disease
Age of menarche
18
Last menstrual period
Cycle: Regular
_(Days)
Irregular
(Days)
Measles
3
2
Flow: Minimal
Moderate
Profuse
Mumps
Pneumonia
Skin Problem
E. PSYCHOSOCIAL HISTORY
Speech Problem
1. Do you have a close friend?
Yes
No
(Only 1?
More than 1
⊥)
Spine Disorder
Yes
No
(Regularly? No
/Yes
Tonsilitis
3. Do you drink alcohol bev.?
Yes
No
(How often?
How much?
Tuberculosis
(Sticks/Day?
7
4. Do you smoke?
Yes
NoT
Since when?
Typhoid fever
Hvo aen illict d?
Yes
No1
(Kind:
Regular use? No
Yes
Others:
6. Experienced abuse?
Yes
1
No
Physical
Yes
No 1
Sexual
Yes
No/
Verbal
Yes
1
No
I hereby certify that the foregoing answers are true and complete, and to the best of my knowledge.
11/06/2026
Student's Signature
Date
PART 2 (to be filled up by the School Physician)
PHYSICAL EXAMINATION
DATE:
Body Mass Index (BMI)
Weight
Height
BP
Pulse
Skin
Head
Eyes/Vision
Ears/ Hearing
Nose
Mouth
Gum
Throat
Neck
Chest
Lungs
Abdomen
Limbs
Neuro
Other significant findings:
Not fit for enrollment
Pending, Reason:
Filness certification:
Fit for enrollment
Recommendation/s:
Impressions/s:
The above findings are certified and are based on the physical examination, diagnostic results available, and the disclosure of the patient's pertinent medical history at the time and date of
examiations.
License No.
Date of Examination
School Physician's signature over printed name
`;

const result = evaluateDocumentFields(groundTruth, ocrText);

console.log("FIELD EVALUATION SUMMARY");
console.log({
  total: result.total,
  correct: result.correct,
  incorrect: result.incorrect,
  missing: result.missing,
  unverifiable: result.unverifiable,
  accuracy: result.accuracy,
  coverage: result.coverage,
});

console.log("\nFIELD DETAILS");
console.table(result.details);
